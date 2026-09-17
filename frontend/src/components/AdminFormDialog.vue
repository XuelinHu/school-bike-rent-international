<template>
  <Modal :open="open" :title="title" @close="$emit('close')">
    <form class="form" @submit.prevent="submit">
      <label v-for="field in visibleFields" :key="field.key" class="field">
        <span class="field-label">
          {{ t(field.labelKey || field.key) }}
          <em v-if="isRequired(field)" class="req">*</em>
        </span>

        <textarea
          v-if="field.type === 'textarea'"
          v-model="values[field.key]"
          rows="4"
        />
        <select v-else-if="field.type === 'select'" v-model="values[field.key]">
          <option value="">{{ t('pleaseSelect') }}</option>
          <option v-for="opt in optionsOf(field)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <input
          v-else
          v-model="values[field.key]"
          :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
          :step="field.step"
          autocomplete="off"
        />

        <small v-if="localError[field.key]" class="field-error">{{ localError[field.key] }}</small>
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <div class="row">
        <button class="btn" type="submit" :disabled="saving">{{ saving ? t('saving') : t('save') }}</button>
        <button class="btn secondary" type="button" @click="$emit('close')">{{ t('cancel') }}</button>
      </div>
    </form>
  </Modal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import Modal from './Modal.vue';
import { request } from '../api/client.js';
import { state, t } from '../i18n/index.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  schema: { type: Object, required: true },
  /** null = 新建 */
  row: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' }
});
const emit = defineEmits(['close', 'submit']);

const values = reactive({});
const localError = reactive({});
/** 远程选项缓存，键是 field.key */
const remoteOptions = reactive({});

const isEdit = computed(() => Boolean(props.row?.id));
const title = computed(() => `${isEdit.value ? t('edit') : t('create')} · ${t(props.schema.titleKey)}`);

// createOnly 的字段（如 username）在编辑时整个不出现——后端也不接受改用户名
const visibleFields = computed(() =>
  props.schema.form.filter((f) => !(f.createOnly && isEdit.value))
);

function isRequired(field) {
  return isEdit.value ? Boolean(field.required) : Boolean(field.required || field.requiredOnCreate);
}

/** 静态选项走 labelKey，远程选项在拉取时就已算好 label */
function optionsOf(field) {
  if (field.optionsFrom) return remoteOptions[field.key] || [];
  return (field.options || []).map((o) => ({ value: o.value, label: t(o.labelKey) }));
}

async function loadRemoteOptions(field) {
  if (!field.optionsFrom) return;
  try {
    const data = await request(`${field.optionsFrom.path}?pageSize=100`);
    const list = data?.list || data || [];
    remoteOptions[field.key] = list.map((item) => ({
      value: field.optionsFrom.value(item),
      label: field.optionsFrom.label(item, state.lang)
    }));
  } catch {
    remoteOptions[field.key] = [];
  }
}

/** 打开弹框时按当前行重置表单，避免残留上一次编辑的值 */
watch(
  () => [props.open, props.row?.id],
  ([open]) => {
    if (!open) return;
    for (const key of Object.keys(values)) delete values[key];
    for (const key of Object.keys(localError)) delete localError[key];
    for (const field of props.schema.form) {
      const current = props.row?.[field.key];
      // 不 String() 化：站点/车辆下拉的选项 value 是数字，先转成字符串虽然靠 looseEqual
      // 也能选中，但提交时会把 "3" 这种字符串发回后端。保持原类型最省心。
      values[field.key] = current == null ? '' : current;
      loadRemoteOptions(field);
    }
  },
  { immediate: true }
);

/**
 * 数字框归一化：空 -> 显式 null，有值 -> Number，非法 -> 不提交。
 *
 * 为什么空值一律发 null 而不是省略字段：mysql2 的 execute() 遇到 undefined 参数会抛
 * "Bind parameters must not contain undefined"，而省略字段就等于让后端的
 * `x ?? current.x` 去处理 undefined——不是每个路由都写对了。发显式 null 语义明确：
 * "这个字段的值是空的"，后端可空列直接落 NULL。
 */
function normalize(field, raw) {
  if (field.type !== 'number') return raw;
  if (raw === '' || raw == null) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

function validate() {
  for (const key of Object.keys(localError)) delete localError[key];
  for (const field of visibleFields.value) {
    const raw = values[field.key];
    const empty = raw === '' || raw == null;
    if (isRequired(field) && empty) {
      localError[field.key] = t('fieldRequired');
      continue;
    }
    if (!empty && field.minLength && String(raw).length < field.minLength) {
      localError[field.key] = t('fieldTooShort').replace('{n}', field.minLength);
    }
  }
  return Object.keys(localError).length === 0;
}

function submit() {
  if (!validate()) return;
  const payload = {};
  for (const field of visibleFields.value) {
    const value = normalize(field, values[field.key]);
    // undefined 表示"这个字段本次不提交"。注意 mysql2 的 execute() 遇到 undefined 参数会直接抛错，
    // 所以绝不能把 undefined 塞进 body 里发出去。
    if (value !== undefined) payload[field.key] = value;
  }
  emit('submit', payload);
}
</script>
