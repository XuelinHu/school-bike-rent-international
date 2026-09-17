/**
 * 开发期自检：只在 `npm run dev` 下运行（main.js 用 import.meta.env.DEV 包住），
 * 生产构建不会包含这段代码。
 *
 * 唯一目的：把"文案缺失"这种**静默失败**变成控制台里一句明确的报错。
 * 现有表单/表格是拿字段名和枚举值直接当 i18n key 查的（t(row.status)、t(field.key)），
 * 少一个 key 不会抛异常，只会在界面上显示成英文原文——很容易一路带到验收现场。
 */
import { auditKeys, missingKeys } from './i18n/index.js';
import { adminSchemas } from './config/adminSchemas.js';

export function runDevChecks() {
  const problems = [];

  // 1) 中英文 key 集合必须一致
  const { missing } = auditKeys();
  for (const [lang, keys] of Object.entries(missing)) {
    if (keys.length) problems.push(`${lang} 缺少 ${keys.length} 个 key: ${keys.join(', ')}`);
  }

  // 2) 管理台 schema 里引用到的每一个 key 都必须有译文
  const referenced = new Set();
  for (const [type, schema] of Object.entries(adminSchemas)) {
    referenced.add(type);
    // 表格列：列头查 col.labelKey || col.key；status 列的值查枚举原文
    for (const col of schema.columns) referenced.add(col.labelKey || col.key);
    // 筛选项：下拉里的 labelKey，以及筛选控件的标签
    for (const f of schema.filters) {
      referenced.add(f.labelKey || f.key);
      for (const opt of f.options || []) referenced.add(opt.labelKey);
    }
    // 表单字段
    for (const field of schema.form) referenced.add(field.labelKey || field.key);
    // 行内操作按钮
    for (const act of schema.rowActions || []) referenced.add(act.labelKey);
    if (schema.deleteHintKey) referenced.add(schema.deleteHintKey);
  }

  const gone = missingKeys([...referenced]);
  if (gone.length) problems.push(`管理台 schema 引用了不存在的 key: ${gone.join(', ')}`);

  if (problems.length) {
    console.error('[devcheck] 文案自检未通过：');
    for (const p of problems) console.error('  ✗', p);
  } else {
    console.info('[devcheck] 文案自检通过');
  }
  return problems;
}
