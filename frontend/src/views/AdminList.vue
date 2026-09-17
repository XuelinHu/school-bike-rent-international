<template>
  <section v-if="schema">
    <div class="row">
      <h1>{{ t(type) }}</h1>
      <button v-if="schema.canCreate" class="btn" @click="openCreate">{{ t('create') }}</button>
    </div>

    <div class="row filters">
      <input
        v-model="keyword"
        class="filter-input"
        :placeholder="t('searchPlaceholder')"
        @keyup.enter="search"
      />
      <template v-for="f in schema.filters" :key="f.key">
        <select v-if="f.type === 'select'" v-model="filters[f.key]" @change="search">
          <option value="">{{ t('all') }} · {{ t(f.labelKey || f.key) }}</option>
          <option v-for="opt in f.options || []" :key="opt.value" :value="opt.value">{{ t(opt.labelKey) }}</option>
        </select>
        <label v-else-if="f.type === 'date'" class="filter-date">
          {{ t(f.labelKey || f.key) }}
          <input v-model="filters[f.key]" type="date" @change="search" />
        </label>
      </template>
      <button class="btn secondary" @click="search">{{ t('search') }}</button>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>

    <AdminTable
      :schema="schema"
      :rows="rows"
      :loading="loading"
      @edit="openEdit"
      @delete="confirmDelete"
      @action="confirmAction"
    />

    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
    />

    <AdminFormDialog
      :open="dialogOpen"
      :schema="schema"
      :row="editing"
      :saving="saving"
      :error="dialogError"
      @close="dialogOpen = false"
      @submit="submit"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import AdminTable from '../components/AdminTable.vue';
import AdminFormDialog from '../components/AdminFormDialog.vue';
import Pagination from '../components/Pagination.vue';
import { useAdminCrud } from '../composables/useAdminCrud.js';
import { getSchema } from '../config/adminSchemas.js';
import { t } from '../i18n/index.js';

// 对外契约不变：仍由 6 条路由以 props.type 驱动，路由表不用动
const props = defineProps({ type: { type: String, required: true } });

const schema = computed(() => getSchema(props.type));
const {
  rows, total, page, pageSize, keyword, filters, loading, error,
  save, remove, runAction, search
} = useAdminCrud(() => props.type);

const dialogOpen = ref(false);
const dialogError = ref('');
const saving = ref(false);
/** 正在编辑的行；null 表示新建 */
const editing = ref(null);

function openCreate() {
  editing.value = null;
  dialogError.value = '';
  dialogOpen.value = true;
}

function openEdit(row) {
  editing.value = row;
  dialogError.value = '';
  dialogOpen.value = true;
}

async function submit(payload) {
  saving.value = true;
  dialogError.value = '';
  try {
    await save(editing.value?.id, payload);
    dialogOpen.value = false;
  } catch (e) {
    // 错误留在弹框里而不是页面顶部，否则用户填的内容会被"看不见的错误"挡住
    dialogError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(row) {
  const hint = schema.value.deleteHintKey ? `\n${t(schema.value.deleteHintKey)}` : '';
  if (!confirm(`${t('confirmDelete')}${hint}`)) return;
  try {
    await remove(row.id);
  } catch (e) {
    error.value = e.message;
  }
}

async function confirmAction(action, row) {
  if (action.confirmKey && !confirm(t(action.confirmKey))) return;
  try {
    await runAction(action, row);
  } catch (e) {
    error.value = e.message;
  }
}
</script>
