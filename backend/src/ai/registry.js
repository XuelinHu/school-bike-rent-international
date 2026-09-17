/**
 * provider 注册表：把 canonical 调用分发到具体适配器。
 *
 * agent.js 只跟这里打交道，永远不 import 某个具体 provider——
 * 否则"换个模型就能用"这句话会在第一次切 provider 时变成一句空话。
 */
import { aiConfig, parseModelId } from './config.js';
import * as ollama from './provider/ollama.js';
import * as openaiCompat from './provider/openaiCompat.js';
import { ProviderError } from './provider/base.js';

/**
 * 流式对话。签名是 canonical 的，provider 差异在适配器里消化。
 *
 * @returns {AsyncGenerator} canonical 事件流
 */
export function streamChat({ modelId, messages, tools, signal }) {
  const { provider, model } = parseModelId(modelId);
  if (!provider || !model) {
    throw new ProviderError(`模型 id 格式不对：${modelId}（应为 provider:model）`, { status: 400 });
  }

  if (provider === 'ollama') {
    return ollama.streamChat({ model, messages, tools, signal });
  }

  const cloud = aiConfig.clouds.find((c) => c.id === provider);
  if (!cloud) {
    throw new ProviderError(`未知的 provider：${provider}`, { status: 400 });
  }
  return openaiCompat.streamChat({
    baseUrl: cloud.baseUrl,
    apiKey: cloud.apiKey,
    model,
    messages,
    tools,
    signal
  });
}

/**
 * 这个 provider 支不支持 function calling。
 * 不是所有云模型都支持——不支持的时候必须**明确不下发工具**，
 * 否则上游会直接 400，用户看到的是一个莫名其妙的报错。
 */
export function supportsTools(modelId) {
  const { provider } = parseModelId(modelId);
  if (provider === 'ollama') return true;
  // 三家的对话模型都支持；这里留一个开关点，将来遇到不支持的模型好加白名单
  return ['deepseek', 'bailian', 'openai'].includes(provider);
}

export { ProviderError };
