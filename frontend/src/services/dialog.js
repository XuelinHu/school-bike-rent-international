/**
 * 语音对话状态机。把 voice.js 的两个零件（识别器 + TTS）编成一个"说一句 → 听到回答"的闭环。
 *
 * 状态流转：
 *
 *   idle ──start()──► listening ──收到识别结果──► transcribing ──► thinking ──► speaking
 *     ▲                   ▲                                                      │
 *     │                   └──────────── TTS 念完 + 250ms ◄───────────────────────┘
 *     └──stop()/出错/重启超限── 任意状态
 *
 * ⚠️ 三条必须守住的规则，破了任何一条这个功能都会"看起来能用但很难用"：
 *
 *   1. **说话期间绝不开麦**。扬声器放出来的助手回答会被麦克风录进去，识别成新问题，
 *      再回答再录 —— 自我对话死循环。这是语音对话最经典的 bug，P3 里唯一不能妥协的一条。
 *      实现上就是 speaking 状态一定调 stop()，且 onEnd 之后**延迟 250ms** 再开：
 *      立刻开会把功放尾音吃进去。
 *
 *   2. **不吃 continuous: true**。语音层的做法见 voice.js 的注释；这里负责在识别真的
 *      结束时按状态决定要不要重开，并把重启次数收敛在有限次（否则网络断了会疯狂重试）。
 *
 *   3. **第一期不做打断（barge-in）**。要开第二个识别窗口轮询用户是否插话，H5 侧实现
 *      复杂且极易自激。用户想插话就按一下停止。
 */

import {
  capabilities,
  createRecognizer,
  speak,
  stopSpeaking,
  __setBridgeHandlers
} from './voice.js';

/** TTS 念完到重新开麦之间的等待。太快会把扬声器尾音录进去 */
const RESUME_DELAY_MS = 250;

/**
 * 桥接分支的重启参数。
 * ⚠️ 为什么这里还要一套重启逻辑：voice.js 的**浏览器分支**自带 onend 重启循环
 * （因为它能拿到 onend 事件），但**桥接分支不能** —— 原生那边只在真正结束时回调一次，
 * 没有"你重启一下"的机制。所以桥接的循环只能在这里做。两套不冲突：浏览器分支
 * 自己会续，这里只对桥接生效。
 */
const BRIDGE_RESTART_DELAY_MS = 300;
const BRIDGE_MAX_RESTART = 5;

/**
 * 播报看门狗。Chrome 在长文本上偶发不触发 onend（尤其配合 cancel() 时），
 * 一旦漏掉，状态机会永远停在 speaking —— 麦克风关着、界面显示"正在播报"，
 * 用户以为死机了。按字数估一个上限，到点强制收尾。
 */
const SPEAK_WATCHDOG_BASE_MS = 4000;
const SPEAK_WATCHDOG_PER_CHAR_MS = 180;
const SPEAK_WATCHDOG_MAX_MS = 120_000;

/**
 * @param {object} opts
 * @param {(text:string)=>void} [opts.onTranscript] 识别出的一句话。调用方负责送去问模型
 * @param {(state:string)=>void} [opts.onState]     状态变化通知，用于渲染
 * @param {(code:string)=>void}  [opts.onError]     不可自愈的错误（重启超限、桥报错）
 */
export function createDialogController(opts = {}) {
  const caps = capabilities();

  /** @type {'idle'|'listening'|'transcribing'|'thinking'|'speaking'} */
  let state = 'idle';
  /** 用户是否"想"在对话中。stop() 之后所有异步回调都要靠它判断该不该继续 */
  let active = false;
  let bridgeRestarts = 0;
  /** 每次播报 +1，用来丢弃迟到的 onSpeakEnd（浏览器与桥两条回调路径可能都到） */
  let speakGen = 0;
  let speakTimer = null;
  let resumeTimer = null;

  const recognizer = createRecognizer({
    // 语言跟着界面走。答案用什么语言朗读是另一回事，由 voice.js 的 detectScript 判断
    lang: (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh-CN',
    onResult: (text) => handleResult(text),
    onError: (code) => handleError(code),
    onEnd: () => handleEnd()
  });

  function setState(next) {
    if (state === next) return;
    state = next;
    opts.onState?.(state);
  }

  function clearTimers() {
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  }

  // ── 识别侧 ──

  function handleResult(text) {
    if (!active || state === 'speaking') return;
    bridgeRestarts = 0; // 有结果说明链路是通的，重置重启计数
    // 先关麦再送出去：问模型期间用户说什么都不该被当成新问题（会插队）
    recognizer.stop();
    setState('transcribing');
    opts.onTranscript?.(text);
  }

  function handleError(code) {
    // no-speech / aborted 是正常现象，voice.js 已经过滤过一轮，这里兜底
    if (code === 'no-speech' || code === 'aborted') return;
    if (code === 'too-many-restarts') {
      active = false;
      setState('idle');
      opts.onError?.('too-many-restarts');
      return;
    }
    opts.onError?.(String(code));
  }

  /** 识别结束（可能是说完一句，也可能是被我们叫停的） */
  function handleEnd() {
    if (!active || state !== 'listening') return;
    // 只有桥接分支需要在这里续；浏览器分支由 voice.js 自己重启
    if (!caps.bridge) return;
    if (bridgeRestarts >= BRIDGE_MAX_RESTART) {
      active = false;
      setState('idle');
      opts.onError?.('too-many-restarts');
      return;
    }
    bridgeRestarts += 1;
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (active && state === 'listening') listen();
    }, BRIDGE_RESTART_DELAY_MS);
  }

  function listen() {
    if (!recognizer.available) {
      // 环境不支持语音输入（公网 HTTP 入口就是这种情况），直接收摊并报明原因
      active = false;
      setState('idle');
      opts.onError?.(caps.reason || 'no-speech-recognition');
      return;
    }
    setState('listening');
    recognizer.start();
  }

  // ── 播报侧 ──
  //
  // 句子级播报：不等整段回答流完再念，而是**攒够一个完整句就送出去**。
  // 这不是锦上添花：这台机器上 qwen3:14b 出完整回答要 20 秒左右，
  // 全程静音地等 20 秒，用户根本分不清是在思考还是死了 —— 而语音场景下
  // 用户是没有文字可看的。代价是回答会被切成几段念，断句按中文标点走，听起来自然。

  /** 待播队列、这一轮是否已流完、已经交给 TTS 的字符位置 */
  let queue = [];
  let streamDone = false;
  let spokenUpTo = 0;
  let speakingChunk = false;
  /** 每句播报的代次，用来丢弃重复/迟到的"念完了"回调 */
  let chunkToken = 0;
  /** 当前这句的结束回调，供不带参数的桥回调用 */
  let bridgeChunkEnd = null;

  /** 进入播报态：关麦 + 开一代新的播报（作废上一代的迟到回调） */
  function beginSpeaking() {
    if (state === 'speaking') return;
    recognizer.stop();          // 规则 1 的前半条
    clearTimers();
    queue = [];
    streamDone = false;
    spokenUpTo = 0;
    speakingChunk = false;
    speakGen += 1;
    setState('speaking');
  }

  /** 收尾，幂等：浏览器 onEnd、桥 onSpeakEnd、看门狗谁先到都行 */
  function finishSpeaking(gen) {
    if (gen !== speakGen) return;
    if (state !== 'speaking') return;
    if (!active) { setState('idle'); return; }
    // 规则 1 的后半条：等功放尾音散掉再开麦
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (active && state === 'speaking') listen();
    }, RESUME_DELAY_MS);
  }

  /** 队列推进：念完一句接下一句；队列空了且流也完了才收尾 */
  function pump() {
    if (!active || state !== 'speaking') return;
    clearSpeakTimer();

    if (!queue.length) {
      // 注意这里是**唯一的收尾出口**，所以每一条走到空队列的路径都要能到这儿
      if (streamDone) finishSpeaking(speakGen);
      return;
    }

    const sentence = queue.shift();
    const gen = speakGen;
    speakingChunk = true;

    // ⚠️ 每句一个 token。结束回调有三条来源（浏览器 onend、桥 onSpeakEnd、看门狗），
    // 谁先到都算数，后到的必须被丢掉 —— 否则一句会被当成"念完了"处理两次，
    // 队列被推快一格，表现是句子被跳着念。
    const token = (chunkToken += 1);
    const onChunkEnd = () => {
      if (token !== chunkToken) return; // 本句已经结算过了
      chunkToken += 1;                  // 作废自己，重复回调不再生效
      if (gen !== speakGen) return;     // 整段对话已经换代（用户停止/重开）
      speakingChunk = false;
      pump();
    };
    // 桥的回调不带参数，只能从这里取。浏览器路径走 speak() 的 onEnd，两条路都汇到 onChunkEnd
    bridgeChunkEnd = onChunkEnd;

    const started = speak(sentence, { onEnd: onChunkEnd });

    if (!started) {
      // 没有 TTS 能力：把队列倒掉直接收尾，别停在永远不会来的回调上
      speakingChunk = false;
      queue = [];
      bridgeChunkEnd = null;
      if (streamDone) finishSpeaking(gen);
      return;
    }

    // 看门狗：Chrome 偶发不触发 onend，漏一次整段对话就卡死在这里
    const budget = Math.min(
      SPEAK_WATCHDOG_BASE_MS + sentence.length * SPEAK_WATCHDOG_PER_CHAR_MS,
      SPEAK_WATCHDOG_MAX_MS
    );
    speakTimer = setTimeout(() => { speakTimer = null; onChunkEnd(); }, budget);
  }

  function clearSpeakTimer() {
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
  }

  /** 丢掉这一轮的播报残留。退出对话/重开时必须调，否则上一轮的尾巴会被念出来 */
  function resetSpeech() {
    clearSpeakTimer();
    chunkToken += 1; // 作废在途的句子结束回调
    bridgeChunkEnd = null;
    queue = [];
    streamDone = false;
    spokenUpTo = 0;
    speakingChunk = false;
  }

  /**
   * 把"已经攒够一个完整句"的部分排进队列。
   * 用字符下标切（而不是 split 之后再 join）：split/trim 会改动长度，
   * 拿它做偏移量迟早错位，表现为漏念或重复念半句。
   */
  function enqueueComplete(text) {
    const full = String(text || '');
    const pending = full.slice(spokenUpTo);
    if (!pending) return;

    let lastEnd = -1;
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (/[。！？!?；;\n]/.test(pending[i])) { lastEnd = i; break; }
    }
    if (lastEnd < 0) return; // 还没有完整句，继续等流

    const chunk = pending.slice(0, lastEnd + 1);
    spokenUpTo += lastEnd + 1;
    if (chunk.trim()) queue.push(chunk);
  }

  return {
    get state() { return state; },
    get active() { return active; },
    get capabilities() { return caps; },
    /** 当前状态对应的 i18n key，UI 直接用 */
    get stateKey() { return 'voice' + state.charAt(0).toUpperCase() + state.slice(1); },

    start() {
      if (active) return;
      active = true;
      bridgeRestarts = 0;
      // 进来先把可能还在念的掐掉，否则第一句话会被自己的声音盖住
      stopSpeaking();
      clearTimers();
      resetSpeech();
      listen();
    },

    /** 完全退出对话：关麦、停播报、回 idle */
    stop() {
      active = false;
      clearTimers();
      speakGen += 1; // 作废在途的播报回调
      resetSpeech();
      stopSpeaking();
      recognizer.abort();
      setState('idle');
    },

    /** 识别结果已经送去问模型了。调用方在 onTranscript 里发完请求调一下 */
    thinking() {
      if (!active) return;
      if (state === 'transcribing' || state === 'listening') setState('thinking');
    },

    /**
     * 流式过程中持续喂入**到目前为止的累计回答**（不是分片）。
     * 攒够一个完整句就会开始念，不用等整段说完。
     *
     * ⚠️ 入参必须是"累计全文"，不是增量分片 —— 内部按字符下标切分，
     * 传分片会把偏移量算错，表现为漏念或把半句话念两遍。
     */
    feed(text) {
      if (!active) return;
      beginSpeaking();
      enqueueComplete(text);
      pump();
    },

    /**
     * 这一轮流完了。把尾巴（最后一句可能没有句末标点）补上，并标记可以收尾了。
     */
    finish(text) {
      if (!active) return;
      const full = String(text || '');

      if (!full.trim()) {
        // 空回答。注意**不能**走 finishSpeaking：它只在 speaking 态生效，
        // 而这条路径下状态还停在 thinking，调了等于什么都没做，对话就卡死了。
        if (state === 'speaking') { streamDone = true; pump(); }
        else if (active) listen();
        return;
      }

      beginSpeaking();
      const rest = full.slice(spokenUpTo);
      spokenUpTo = full.length;
      if (rest.trim()) queue.push(rest);
      streamDone = true;
      pump();
    },

    /** 这一轮失败了（模型报错/网络断）：别继续听，回 idle 让用户自己决定 */
    fail() {
      if (!active) return;
      active = false;
      clearTimers();
      speakGen += 1;
      resetSpeech();
      stopSpeaking();
      recognizer.abort();
      setState('idle');
    },

    destroy() {
      this.stop();
      __setBridgeHandlers({ onResult: null, onError: null, onEnd: null, onSpeakEnd: null });
    },

    // ── 供 bindBridgeCallbacks 使用的原生回调入口 ──
    // 加下划线是因为它们**不该被 UI 直接调**：只有安卓侧 evaluateJavascript 触发的
    // __bridgeDispatch 才会走到这里，手动调会把状态机推到不一致的状态。
    __handleBridgeResult: handleResult,
    __handleBridgeError: handleError,
    __handleBridgeEnd: handleEnd,
    // 桥的"念完了"只代表**当前这一句**念完了，必须交给 onChunkEnd 推进队列。
    // 早先这里直接调 finishSpeaking，等于每念一句就结束整个播报阶段，
    // 而流式 watcher 下一拍又把状态拽回 speaking —— 表现为麦克风在句子之间反复开关。
    __handleBridgeSpeakEnd: () => bridgeChunkEnd?.()
  };
}

/**
 * 把安卓桥的回调接到状态机上。**必须在创建 controller 之前或之后立刻调一次**，
 * 否则原生识别出来的文字会走进 voice.js 里那张空表，表现为"原生说识别完了，界面没反应"。
 *
 * 原生回传的 payload 形状不可控（可能是 JSON 字符串、也可能是对象），这里逐种兜住。
 */
export function bindBridgeCallbacks(controller) {
  const pick = (payload) => {
    if (!payload) return '';
    if (typeof payload === 'string') {
      try {
        const o = JSON.parse(payload);
        return o?.text || o?.transcript || '';
      } catch {
        return payload; // 原生直接回传了纯文本
      }
    }
    return payload.text || payload.transcript || '';
  };

  __setBridgeHandlers({
    onResult: (payload) => {
      const text = String(pick(payload) || '').trim();
      if (text) controller.__handleBridgeResult?.(text);
    },
    onError: (payload) => controller.__handleBridgeError?.(String(payload?.code || payload || 'bridge-error')),
    onEnd: () => controller.__handleBridgeEnd?.(),
    onSpeakEnd: () => controller.__handleBridgeSpeakEnd?.()
  });
}
