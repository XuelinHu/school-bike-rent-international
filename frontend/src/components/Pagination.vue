<template>
  <div class="pager">
    <span class="pager-total">{{ t('total') }}: {{ total }}</span>

    <div class="pager-pages">
      <button class="pager-btn" :disabled="page <= 1" @click="go(1)">«</button>
      <button class="pager-btn" :disabled="page <= 1" @click="go(page - 1)">‹</button>

      <button
        v-for="p in visiblePages"
        :key="p"
        class="pager-btn"
        :class="{ active: p === page }"
        @click="go(p)"
      >{{ p }}</button>

      <button class="pager-btn" :disabled="page >= pageCount" @click="go(page + 1)">›</button>
      <button class="pager-btn" :disabled="page >= pageCount" @click="go(pageCount)">»</button>
    </div>

    <label class="pager-size">
      {{ t('perPage') }}
      <select :value="pageSize" @change="changeSize($event.target.value)">
        <option v-for="s in selectableSizes" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { t } from '../i18n/index.js';

const props = defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
  total: { type: Number, default: 0 },
  sizeOptions: { type: Array, default: () => [10, 20, 50] }
});
const emit = defineEmits(['update:page', 'update:pageSize']);

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

/**
 * 下拉里必须有与当前 pageSize 相等的选项，否则 <select> 匹配不到 → selectedIndex 变成 -1
 * → 用户一操作就拿回空字符串。实测过这个坑：空串经 Number('') 变成 0，
 * 后端把 pageSize 夹到 1，界面表现成"每页只出一行、总数却没错"。
 */
const selectableSizes = computed(() => {
  const sizes = [...props.sizeOptions];
  if (!sizes.includes(props.pageSize)) sizes.push(props.pageSize);
  return sizes.sort((a, b) => a - b);
});

/**
 * 页码按钮。总数多时只显示当前页附近 + 首尾，避免一屏几十个按钮。
 * 省略处用 '...' 占位（key 用字符串，避免和真实页码冲突）。
 */
const visiblePages = computed(() => {
  const count = pageCount.value;
  const current = props.page;
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) pages.push('...l');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < count - 1) pages.push('...r');
  pages.push(count);
  return pages;
});

function go(target) {
  const next = Math.min(pageCount.value, Math.max(1, Number(target)));
  if (next !== props.page) emit('update:page', next);
}

function changeSize(value) {
  const size = Number(value);
  // 空值/非法值一律忽略，绝不能让 0 或 NaN 传下去
  if (!Number.isInteger(size) || size < 1) return;
  emit('update:pageSize', size);
  // 每页条数变了之后原页码大概率越界，回到第 1 页最不容易让人困惑
  emit('update:page', 1);
}
</script>
