/**
 * 业务知识库入口：静态 Markdown（人写的规则）+ 动态快照（从库里现算）。
 *
 * Markdown 在模块加载时读一次进内存——它是只读的静态文本，
 * 每次请求都 readFile 纯属浪费，而且文件被删掉时会在请求路径上炸。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function load(file) {
  try {
    return readFileSync(join(HERE, file), 'utf8');
  } catch (e) {
    // 知识库读不到不该让服务起不来，退回空串并告警
    console.warn(`[ai] 读不到知识库 ${file}：${e.message}`);
    return '';
  }
}

const BUSINESS = {
  'zh-CN': load('business.zh.md'),
  'en-US': load('business.en.md')
};

/** 归一化语言标签：zh / zh-CN / zh-Hans 都当中文，其余当英文 */
export function normalizeLang(lang) {
  const s = String(lang || '').toLowerCase();
  return s.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function getBusinessKnowledge(lang) {
  return BUSINESS[normalizeLang(lang)] || BUSINESS['zh-CN'];
}

export { getSnapshot, invalidateSnapshot } from './dynamic.js';
