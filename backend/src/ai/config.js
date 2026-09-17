/**
 * AI 层的环境配置。**只读 env，不做任何 IO**——模型目录要实时问 Ollama，那是 catalog.js 的事。
 *
 * 模型 id 一律是 `provider:model` 形式，例如 `ollama:qwen3:14b`、`deepseek:deepseek-chat`。
 * ⚠️ 解析必须用 indexOf(':') 而不是 split(':')——`ollama:qwen3:14b` 用 split 会切成三段。
 */

const bool = (v, dflt) => (v == null || v === '' ? dflt : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
};

export const aiConfig = {
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),

  /**
   * 上下文长度。**0 = 根本不发 num_ctx**，这是默认值，也是这台机器上唯一安全的选项。
   *
   * ⚠️ 这里踩过一个会让整个功能"看起来卡死"的坑，写清楚免得后人再踩：
   * Ollama 把 num_ctx 算作**加载参数**——请求里的值一旦与常驻实例的值不同，
   * 它就会把这个模型整个卸载再按新尺寸重载 KV cache。这块 3090 是与其它项目共用的，
   * 实测当显存只剩 2GB 左右时，这个重载**永远完不成**：连接不断、心跳照发，
   * 但第一个 token 永远不来，客户端只能一直转圈（`/api/ps` 里能看到常驻实例是
   * 别的进程按 32768 加载的，而我们在请求里要 8192，于是每次都触发重载）。
   *
   * 不发 num_ctx 时 Ollama 直接复用常驻实例（哪怕它是别人按 32768 加载的），
   * 零重载、零抖动，多项目共存也不互相踢。**只有独占 GPU 时才建议设成具体值。**
   */
  numCtx: int(process.env.AI_NUM_CTX, 0),

  /** 单轮对话里最多几轮工具调用。14B 在轮次多了以后准确率明显下降，最后一轮会强制不给工具 */
  maxToolRounds: int(process.env.AI_MAX_TOOL_ROUNDS, 3),

  /**
   * 全局并发闸门。Ollama 默认单槽串行，放更多并发只会让大家一起变慢，
   * 而且会挤占同机其它项目的显存。超出的请求排队，队满返回 503。
   */
  maxConcurrency: int(process.env.AI_MAX_CONCURRENCY, 1),
  // 兼容两种写法：.env 里先前写的是 AI_QUEUE_LIMIT
  maxQueue: int(process.env.AI_MAX_QUEUE ?? process.env.AI_QUEUE_LIMIT, 8),

  /** 模型在显存里保活多久。默认 5 分钟太短，冷启动要十几秒；但也别太长，14B 占着 10GB */
  keepAlive: process.env.AI_KEEP_ALIVE || '10m',

  /** 单次回答的输出上限，防止模型跑飞把显存和带宽吃满 */
  maxTokens: int(process.env.AI_MAX_TOKENS, 1024),

  defaultModel: process.env.AI_DEFAULT_MODEL || '',

  /**
   * 响应头超时（毫秒）。**这是"等模型加载完"的上限**，不是"等回答"的上限——
   * Ollama 在模型进显存之前一个字节都不发，所以模型加载时间直接算在这里面。
   *
   * 180s 是实测定的：同机其它项目占着显存时，qwen3:14b 冷加载实测出现过 110s 才出首 token
   * （显存充裕时只要十几秒）。定 120s 会把这种"其实能成"的请求误杀成超时。
   * 前端配套显示已等待秒数，让用户知道是慢而不是死了。
   */
  requestTimeoutMs: int(process.env.AI_REQUEST_TIMEOUT_MS, 180_000),
  /** 流式响应里两次数据之间的最大间隔，超时判定为卡死 */
  idleTimeoutMs: int(process.env.AI_IDLE_TIMEOUT_MS, 60_000),

  /** 云厂商。没配 key 就不出现在下拉里——避免用户选了才发现不能用 */
  clouds: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      models: (process.env.DEEPSEEK_MODELS || 'deepseek-chat').split(',').map((s) => s.trim()).filter(Boolean)
    },
    {
      id: 'bailian',
      label: '阿里百炼',
      baseUrl: (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, ''),
      apiKey: process.env.BAILIAN_API_KEY || '',
      models: (process.env.BAILIAN_MODELS || 'qwen-plus').split(',').map((s) => s.trim()).filter(Boolean)
    },
    {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: (process.env.OPENAI_BASE_URL || '').replace(/\/$/, ''),
      apiKey: process.env.OPENAI_API_KEY || '',
      models: (process.env.OPENAI_MODELS || 'gpt-4o-mini').split(',').map((s) => s.trim()).filter(Boolean)
    }
  ].filter((c) => c.apiKey && c.baseUrl)
};

/**
 * 拆 `provider:model`。用 indexOf 而不是 split：
 * `ollama:qwen3:14b` → provider='ollama', model='qwen3:14b'（模型名自己带冒号是合法的）。
 */
export function parseModelId(id) {
  const raw = String(id || '');
  const i = raw.indexOf(':');
  if (i < 0) return { provider: '', model: raw };
  return { provider: raw.slice(0, i), model: raw.slice(i + 1) };
}

export function buildModelId(provider, model) {
  return `${provider}:${model}`;
}
