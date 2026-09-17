<template>
  <div class="card table-wrap">
    <table>
      <thead>
        <tr>
          <th v-for="col in schema.columns" :key="col.key">{{ col.labelKey ? t(col.labelKey) : t(col.key) }}</th>
          <th v-if="hasActions">{{ t('action') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columnCount" class="muted center">{{ t('loading') }}</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td :colspan="columnCount" class="muted center">{{ t('noData') }}</td>
        </tr>
        <template v-else>
          <tr v-for="row in rows" :key="row.id">
            <td v-for="col in schema.columns" :key="col.key">
              <!-- status: 带色徽章 + 本地化；enum: 只本地化不加徽章（如车辆类型）；
                   其余按数据原样显示（车牌号、邮箱这类不该被翻译） -->
              <span v-if="col.type === 'status'" class="status" :class="row[col.key]">{{ t(row[col.key]) }}</span>
              <template v-else-if="col.type === 'enum'">{{ t(row[col.key]) }}</template>
              <template v-else>{{ format(row[col.key], col.type) }}</template>
            </td>
            <td v-if="hasActions" class="cell-actions">
              <button
                v-for="act in visibleActions(row)"
                :key="act.key"
                class="btn"
                @click="$emit('action', act, row)"
              >{{ t(act.labelKey) }}</button>
              <button v-if="schema.canEdit" class="btn secondary" @click="$emit('edit', row)">{{ t('edit') }}</button>
              <button v-if="schema.canDelete" class="btn danger" @click="$emit('delete', row)">{{ t('delete') }}</button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { t } from '../i18n/index.js';

const props = defineProps({
  schema: { type: Object, required: true },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});
defineEmits(['edit', 'delete', 'action']);

const columnCount = computed(() => props.schema.columns.length + (hasActions.value ? 1 : 0));
const hasActions = computed(
  () => Boolean(props.schema.canEdit || props.schema.canDelete || props.schema.rowActions?.length)
);

function visibleActions(row) {
  return (props.schema.rowActions || []).filter((a) => !a.visible || a.visible(row));
}

const MAX_CELL = 60;

/**
 * DATETIME 列。mysql2 把 "2026-09-18 10:30:00" 解析成本地时区的 Date，
 * 经 JSON 变成 UTC ISO 串，所以这里必须用本地 getter 还原，否则会差 8 小时。
 */
function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function format(value, type) {
  if (value == null || value === '') return '';
  if (type === 'datetime') return formatDateTime(value);
  const text = String(value);
  // 公告正文这类长文本会把表格撑爆，截断显示
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
}
</script>
