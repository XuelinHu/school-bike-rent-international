/**
 * 模型目录：把「本机 Ollama 实时拉到的模型」和「env 里声明的云模型」合成一份下拉列表。
 *
 * 为什么要合并而不是写死：用户装了新模型（`ollama pull`）之后应当直接出现在下拉里，
 * 而不是改代码。所以 Ollama 那一组每次带 TTL 缓存去问 /api/tags。
 */
import { aiConfig, buildModelId } from './config.js';
import { listModels as listOllamaModels } from './provider/ollama.js';

const TTL_MS = 30_000;
let cache = { at: 0, data: null };

/** 强制下次重新拉取（管理台加载/卸载模型后调用） */
export function invalidateCatalog() {
  cache = { at: 0, data: null };
}

/**
 * 取模型目录。
 * @param {object} [opts]
 * @param {boolean} [opts.refresh] 忽略缓存
 */
export async function getCatalog({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && cache.data && now - cache.at < TTL_MS) return cache.data;

  const groups = [];

  // ── 本机组：Ollama ──
  let ollamaModels = [];
  let ollamaError = '';
  try {
    ollamaModels = await listOllamaModels();
  } catch (e) {
    // Ollama 挂了不能让整个目录接口 500——云模型仍然可用，前端也要能给出提示
    ollamaError = e.message;
  }
  groups.push({
    provider: 'ollama',
    label: '本机 Ollama',
    available: !ollamaError,
    error: ollamaError,
    models: ollamaModels.map((m) => ({
      id: buildModelId('ollama', m.name),
      model: m.name,
      label: m.name,
      sizeBytes: m.sizeBytes,
      parameterSize: m.parameterSize,
      quantization: m.quantization,
      family: m.family
    }))
  });

  // ── 云厂商组：没配 key 的已经在 config 里被过滤掉了 ──
  for (const cloud of aiConfig.clouds) {
    groups.push({
      provider: cloud.id,
      label: cloud.label,
      available: true,
      error: '',
      models: cloud.models.map((name) => ({
        id: buildModelId(cloud.id, name),
        model: name,
        label: name,
        sizeBytes: null,
        parameterSize: '',
        quantization: '',
        family: ''
      }))
    });
  }

  // 默认模型：env 指定且确实存在，否则退回第一个可用的
  const all = groups.flatMap((g) => g.models);
  let defaultModel = aiConfig.defaultModel;
  if (!defaultModel || !all.some((m) => m.id === defaultModel)) {
    defaultModel = all[0]?.id || '';
  }

  const data = { groups, defaultModel, models: all };
  cache = { at: now, data };
  return data;
}

/** 校验一个模型 id 是否在目录里，并返回它的 provider 信息 */
export async function resolveModel(id) {
  const catalog = await getCatalog();
  const found = catalog.models.find((m) => m.id === id);
  if (!found) return null;
  const group = catalog.groups.find((g) => g.provider === found.id.slice(0, found.id.indexOf(':')));
  return { ...found, group };
}
