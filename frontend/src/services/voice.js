/**
 * 语音层。TTS（播报）与 STT（听写）共用这一个入口，三条降级链路：
 *
 *   1. **安卓原生桥**（`window.SchoolBikeBridge`）—— WebView 里唯一靠谱的路。
 *      安卓 WebView 默认**没有** `SpeechRecognition`，桥接是必需项不是优化项。
 *   2. **浏览器 Web Speech API** —— 只在安全上下文（HTTPS 或 localhost）下可用。
 *   3. **noop** —— 按钮置灰 + 提示改用文字输入。
 *
 * ⚠️ 一个必须先跟验收方说清的事实：本项目的公网入口是 FRP 的 **纯 TCP 转发**
 * （`http://47.120.48.245:14030`，无 TLS 终结），浏览器判定为非安全上下文，
 * `isSecureContext === false` → **语音输入在公网入口直接不可用**，TTS 播报不受影响。
 * 所以"手机上语音对话"只能走安卓原生桥，或者给站点加上 HTTPS。
 */

/** 安卓桥的注入名，必须与 docs/ai/android-voice-bridge.md 里写的一致 */
const BRIDGE_NAME = 'SchoolBikeBridge';

/** 一次识别最多自动重启几次。H5 的 continuous:true 不可靠，只能自己做循环 */
const MAX_RESTART = 5;
const RESTART_DELAY_MS = 300;

export function getBridge() {
  if (typeof window === 'undefined') return null;
  const b = window[BRIDGE_NAME];
  // 安卓那边注入失败时可能留个空对象/坏对象，这里必须逐方法确认可用
  return b && typeof b.startRecognition === 'function' && typeof b.startSpeak === 'function' ? b : null;
}

/**
 * 当前环境到底能做什么。UI 据此决定按钮是可用、置灰还是走桥。
 * @returns {{tts:boolean, stt:boolean, bridge:boolean, secureContext:boolean, reason:string}}
 */
export function capabilities() {
  const bridge = Boolean(getBridge());
  const hasSynth = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const hasSR = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  // isSecureContext 在 http 页面上是 false —— 这正是语音输入用不了的原因
  const secure = typeof window === 'undefined' ? false : window.isSecureContext !== false;
  const stt = bridge || (hasSR && secure);

  let reason = '';
  if (!stt) {
    reason = bridge ? '' : (!secure ? 'insecure-context' : 'no-speech-recognition');
  }
  return { tts: hasSynth || bridge, stt, bridge, secureContext: secure, reason };
}

/**
 * 判断一段文本该用什么语言朗读。
 *
 * **不能用界面语言**：用户完全可能用英文提问而界面是中文，用中文语音去念英文
 * 会读成灾难（每个字母一个音）。这里按 CJK 字符占比来判断实际内容。
 */
export function detectScript(text) {
  const s = String(text || '');
  if (!s) return 'zh-CN';
  const cjk = (s.match(/[一-鿿㐀-䶿]/g) || []).length;
  // 只看有意义的字符，空格和标点不计入分母
  const meaningful = (s.match(/[\p{L}\p{N}]/gu) || []).length || 1;
  return cjk / meaningful > 0.25 ? 'zh-CN' : 'en-US';
}

/**
 * 去掉不该被念出来的东西。
 * Markdown 标记会被 TTS 逐字读成"星号星号""井号"，URL 会读成一长串字母。
 */
export function sanitizeForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')          // 代码块整块丢掉
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>~]+/g, ' ')                // 强调/标题/引用符号
    .replace(/^\s*[-*+]\s+/gm, '')            // 列表符号
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ') // emoji
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 切成句子。留给"边流边播"用——逐片朗读会把半句话念碎 */
export function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[。！？!?；;])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ───────────────────────────── TTS ─────────────────────────────

/** 当前正在朗读的 requestId（走桥时用来丢弃迟到的回调） */
let speakingId = 0;

/**
 * 朗读一段文本。
 * @param {string} text
 * @param {{lang?:string, rate?:number, onEnd?:Function}} [opts] lang 不传就自动判断
 */
export function speak(text, opts = {}) {
  const clean = sanitizeForSpeech(text);
  if (!clean) return false;

  const lang = opts.lang || detectScript(clean);
  const bridge = getBridge();
  const id = ++speakingId;

  if (bridge) {
    try {
      bridge.startSpeak(JSON.stringify({ requestId: id, text: clean, lang, rate: opts.rate || 1 }));
      return true;
    } catch {
      /* 桥调用失败就往下走浏览器 TTS，不要让整个功能哑掉 */
    }
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

  try {
    // 连读时必须先 cancel，否则 Chrome 会把上一段和新的一段排队念完
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    if (opts.rate) u.rate = opts.rate;
    u.onend = () => { if (id === speakingId) opts.onEnd?.(); };
    u.onerror = () => { if (id === speakingId) opts.onEnd?.(); };

    // ⚠️ getVoices() 首次调用常常返回空数组（voices 还没加载完）。
    // 但**不能因为拿不到 voice 就不念**——utterance 不指定 voice 时浏览器会用
    // lang 匹配的默认音色，本来就是可用的。
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(lang.slice(0, 2)));
    if (match) u.voice = match;

    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  speakingId += 1; // 让所有在途回调失效
  const bridge = getBridge();
  if (bridge) {
    try { bridge.stopSpeak(); } catch { /* 桥没起来 */ }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* 忽略 */ }
  }
}

// ───────────────────────────── STT ─────────────────────────────

/** 什么都不能用时给出的空实现——调用方不用到处写 if */
function noopRecognizer() {
  return {
    start() {},
    stop() {},
    abort() {},
    get available() { return false; }
  };
}

/**
 * 建一个识别器。
 *
 * ⚠️ 两条必须遵守的规则（语音对话最经典的 bug 就在这）：
 *   1. **TTS 播放期间绝对不能开着麦克风**，否则会把助手自己的声音录进去 →
 *      识别成新问题 → 再回答 → 自我对话死循环。调用方（dialog.js）负责在
 *      speaking 状态调 stop()，并在 onEnd 之后**延迟 200~300ms** 再 start()。
 *   2. **不要依赖 `continuous: true`**。Chrome 在静音时照样触发 onend，
 *      还可能抛 no-speech。这里用 continuous:false + 在 onend 里按需重启，
 *      把"连续听"做成应用层的循环。
 *
 * @param {{lang?:string, onResult?:Function, onError?:Function, onEnd?:Function}} opts
 */
export function createRecognizer(opts = {}) {
  const bridge = getBridge();
  const caps = capabilities();
  if (!bridge && !caps.stt) return noopRecognizer();

  const lang = opts.lang || 'zh-CN';
  let restarts = 0;
  let wantListening = false;
  let currentId = 0;

  // ── 走原生桥 ──
  if (bridge) {
    return {
      available: true,
      get listening() { return wantListening; },
      start() {
        wantListening = true;
        currentId += 1;
        try {
          bridge.startRecognition(JSON.stringify({ requestId: currentId, lang, continuous: false, interim: false }));
        } catch (e) {
          opts.onError?.(String(e));
        }
      },
      stop() {
        wantListening = false;
        try { bridge.stopRecognition(); } catch { /* 忽略 */ }
      },
      abort() {
        wantListening = false;
        try { bridge.cancelRecognition(); } catch { /* 忽略 */ }
      }
    };
  }

  // ── 走浏览器 ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  function build() {
    const r = new SR();
    r.lang = lang;
    // 见规则 2：continuous 交给应用层循环，不依赖浏览器实现
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      const text = Array.from(e.results || [])
        .map((res) => res[0]?.transcript || '')
        .join('')
        .trim();
      if (text) {
        restarts = 0; // 有结果就重置计数，避免长时间对话被上限掐断
        opts.onResult?.(text);
      }
    };

    r.onerror = (e) => {
      const code = e?.error || 'unknown';
      // no-speech / aborted 是正常现象（用户没说话、或我们自己叫停的），不要报给用户
      if (code !== 'no-speech' && code !== 'aborted') opts.onError?.(code);
    };

    r.onend = () => {
      opts.onEnd?.();
      if (!wantListening) return;
      // 应用层重启：延迟一点再开，避免刚关就开导致的 InvalidStateError
      if (restarts >= MAX_RESTART) {
        wantListening = false;
        opts.onError?.('too-many-restarts');
        return;
      }
      restarts += 1;
      setTimeout(() => {
        if (!wantListening) return;
        try { r.start(); } catch { /* 已经在跑了 */ }
      }, RESTART_DELAY_MS);
    };
    return r;
  }

  return {
    available: true,
    get listening() { return wantListening; },
    start() {
      wantListening = true;
      restarts = 0;
      if (!rec) rec = build();
      try {
        rec.start();
      } catch {
        // 重复 start() 会抛 InvalidStateError —— 说明已经在听了，忽略即可
      }
    },
    stop() {
      wantListening = false;
      try { rec?.stop(); } catch { /* 没在跑 */ }
    },
    abort() {
      wantListening = false;
      try { rec?.abort(); } catch { /* 没在跑 */ }
    }
  };
}

/**
 * 安卓桥回调入口（原生 → JS）。
 * 由 index.html / 安卓侧 evaluateJavascript 调用，见 docs/ai/android-voice-bridge.md。
 * 这里只做分发，具体状态机在 dialog.js。
 */
const bridgeHandlers = { onResult: null, onError: null, onEnd: null, onSpeakEnd: null };

export function __bridgeDispatch(kind, payload) {
  const fn = bridgeHandlers[kind];
  if (typeof fn === 'function') fn(payload);
}

export function __setBridgeHandlers(handlers) {
  Object.assign(bridgeHandlers, handlers);
}

/**
 * 把回调挂到 window 上，供安卓侧 `evaluateJavascript("__schoolBikeVoiceOnResult(...)")` 调用。
 *
 * ⚠️ 这一步之前漏了：文档里写的回调名在页面上根本不存在，原生调过来会静默失败，
 * 表现为"原生识别完了、页面没反应"。挂在这里而不是 index.html，是因为它必须与
 * 上面的分发表同生共死 —— 谁引用 voice.js，回调就是可用的。
 *
 * 每个回调都**先判存在再调用**（安卓侧同样要判，两边都判才防得住版本错配）。
 */
if (typeof window !== 'undefined') {
  window.__schoolBikeVoiceOnResult = (payload) => __bridgeDispatch('onResult', payload);
  window.__schoolBikeVoiceOnError = (payload) => __bridgeDispatch('onError', payload);
  window.__schoolBikeVoiceOnEnd = (payload) => __bridgeDispatch('onEnd', payload);
  window.__schoolBikeVoiceOnSpeakStart = (payload) => __bridgeDispatch('onSpeakStart', payload);
  window.__schoolBikeVoiceOnSpeakEnd = (payload) => __bridgeDispatch('onSpeakEnd', payload);
}
