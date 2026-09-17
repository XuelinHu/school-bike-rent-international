/**
 * 智能体会话状态。沿用项目里 stores/auth.js 的写法（reactive 对象 + localStorage），
 * 不引入 Pinia —— 这个项目一共就两个 store，装一个状态库是净负担。
 *
 * 这里承担三件事：
 *   1. 模型目录（登录后拉一次，缓存在内存里）
 *   2. 会话消息（**只在内存里**，不做持久化：里面有"我的订单"这类内容，
 *      落到 localStorage 会让共用电脑的下一个人直接读到）
 *   3. 流式生命周期：发请求 → 逐事件改写最后一条助手消息 → 可中止
 */
import { reactive } from 'vue';
import { request, streamRequest } from '../api/client.js';

/** 只保留最近这些条历史发给后端。多了会顶穿模型上下文，而且早就不相关了 */
const MAX_HISTORY = 10;

const LS_MODEL = 'ai_model';
const LS_VOICE = 'ai_voice';

/** provider:model → 展示用的名字。ollama 的模型名自带冒号（qwen3:14b），别用 split(':') */
function labelOf(m) {
  return m.label || m.name || m.id;
}

export const aiStore = reactive({
  /** 面板是否展开 */
  open: false,
  /** 悬浮球是否曾经被点开过（用于首次自动收起提示） */
  everOpened: false,

  // ── 模型目录 ──
  groups: [],
  catalogLoaded: false,
  catalogError: '',
  defaultModel: '',
  /** 当前选中的模型 id，形如 `ollama:qwen3:14b` */
  model: localStorage.getItem(LS_MODEL) || '',
  /** 后端告诉我们"这个角色能用助手做什么"，用于空状态引导 */
  capabilities: [],

  // ── 会话 ──
  messages: [],
  /** '' | 'connecting' | 'waiting' | 'streaming' */
  status: '',
  /** 已经等了多久（秒）。模型冷加载时要几十秒，不显示秒数用户会以为死了 */
  waited: 0,
  error: '',

  voiceEnabled: localStorage.getItem(LS_VOICE) === '1',

  /** 当前这一轮的 AbortController */
  _abort: null,
  _timer: null,

  get streaming() {
    return this.status === 'connecting' || this.status === 'waiting' || this.status === 'streaming';
  },

  /** 目录里的全部模型，拍平成一维，供下拉使用 */
  get flatModels() {
    return this.groups.flatMap((g) => (g.models || []).map((m) => ({ ...m, groupLabel: g.label })));
  },

  async loadCatalog({ force = false } = {}) {
    if (this.catalogLoaded && !force) return;
    try {
      const lang = localStorage.getItem('lang') || 'zh-CN';
      const data = await request(`/ai/models?lang=${encodeURIComponent(lang)}`);
      this.groups = data.groups || [];
      this.defaultModel = data.defaultModel || '';
      this.capabilities = data.capabilities || [];
      this.catalogError = '';

      // 选中的模型可能已经不在本机了（被卸载/换机器），回落到默认
      const ids = this.flatModels.map((m) => m.id);
      if (!ids.includes(this.model)) this.setModel(ids.includes(this.defaultModel) ? this.defaultModel : ids[0] || '');

      this.catalogLoaded = true;
    } catch (e) {
      this.catalogError = e.message;
    }
  },

  setModel(id) {
    this.model = id || '';
    try { localStorage.setItem(LS_MODEL, this.model); } catch { /* 隐私模式 */ }
  },

  setVoice(on) {
    this.voiceEnabled = Boolean(on);
    try { localStorage.setItem(LS_VOICE, this.voiceEnabled ? '1' : '0'); } catch { /* 隐私模式 */ }
  },

  openPanel() {
    this.open = true;
    this.everOpened = true;
    this.loadCatalog();
  },

  closePanel() {
    this.open = false;
    // 关掉面板不等于停止生成：用户可能只是想边等边看别的页面。
    // 真正的停止只有"停止"按钮和清空会话。
  },

  reset() {
    this.stop();
    this.messages = [];
    this.error = '';
    this.status = '';
  },

  /** 中止当前生成。后端会收到连接关闭并 abort 掉上游 */
  stop() {
    if (this._abort) {
      try { this._abort.abort(); } catch { /* 已结束 */ }
      this._abort = null;
    }
    this._stopTimer();
    if (this.status) this.status = '';
  },

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  _startTimer() {
    this._stopTimer();
    this.waited = 0;
    this._timer = setInterval(() => { this.waited += 1; }, 1000);
  },

  /**
   * 发一条消息并消费流。
   * 事件契约见 backend/src/ai/agent.js —— 这里只认 type，不解析任何上游原始报文。
   */
  async send(text) {
    const content = String(text || '').trim();
    if (!content || this.streaming) return;
    if (!this.model) {
      this.error = 'aiPickModel';
      return;
    }

    this.error = '';
    this.messages.push({ role: 'user', content });

    // 助手这条先占位，后面按事件往里追加，界面就不用做"新增/更新"两套逻辑
    const reply = reactive({ role: 'assistant', content: '', tools: [], error: '', stopped: false });
    this.messages.push(reply);

    const controller = new AbortController();
    this._abort = controller;
    this.status = 'connecting';
    this._startTimer();

    // 只带 user/assistant 两种角色；后端还会再洗一遍，这里先不多发
    const history = this.messages
      .filter((m) => !m.error && (m.role === 'user' || m.role === 'assistant'))
      .slice(0, -1)   // 去掉刚占位的那条空助手消息
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      for await (const ev of streamRequest('/ai/chat', {
        body: { model: this.model, messages: history, lang: localStorage.getItem('lang') || 'zh-CN' },
        signal: controller.signal
      })) {
        // 只要开始出内容，就不该再显示"加载中"了
        if (ev.type === 'text' && !reply.content) {
          this.status = 'streaming';
          this._stopTimer();
        }
        if (ev.type === 'ping') {
          // 心跳只用来证明连接还活着；秒数由本地计时器走，避免依赖服务端时钟
          if (this.status === 'connecting') this.status = 'waiting';
          continue;
        }
        this._apply(ev, reply);
      }
    } catch (e) {
      // 用户主动点停止：AbortError 不是错误，界面也不该报红
      if (e.name === 'AbortError' || controller.signal.aborted) {
        reply.stopped = true;
      } else {
        reply.error = e.message || 'aiFailed';
      }
    } finally {
      this._abort = null;
      this._stopTimer();
      this.status = '';
    }
  },

  /** 把一条 canonical 事件落到占位的助手消息上 */
  _apply(ev, reply) {
    switch (ev.type) {
      case 'text':
        reply.content += ev.text;
        break;
      case 'tool_call':
        // 只记名字，中文文案交给 i18n（见 ChatWidget 里的 tool_* 键）
        reply.tools.push({ name: ev.name, done: false, ok: true });
        break;
      case 'tool_result': {
        const t = reply.tools.find((x) => x.name === ev.name && !x.done);
        if (t) { t.done = true; t.ok = ev.ok !== false; }
        break;
      }
      case 'reset':
        // 模型"只说不做"退化，后端要求把这轮已经流出去的字符清掉
        reply.content = '';
        break;
      case 'error':
        reply.error = ev.message || 'aiFailed';
        break;
      case 'done':
        // 一轮里模型可能先说话再调工具再说话；这里只负责收尾
        if (!reply.content && !reply.tools.length) reply.error = reply.error || 'aiEmpty';
        break;
      default:
        break;
    }
  }
});
