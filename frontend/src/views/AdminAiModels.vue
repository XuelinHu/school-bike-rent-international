<template>
  <section>
    <div class="ai-head">
      <h1>{{ t('aiModels') }}</h1>
      <button class="btn secondary" type="button" :disabled="loading" @click="refresh">
        {{ loading ? t('loading') : t('refresh') }}
      </button>
    </div>

    <p v-if="error" class="chat-note err">{{ error }}</p>

    <!--
      显存面板排在最前面，不是装饰：这块 3090 是共用的，加载一个 14B 模型要吃掉十几 G。
      先看到"还剩多少、谁在占"，再决定点不点加载 —— 顺序反了就一定会有人误操作。
    -->
    <div class="card">
      <h3>{{ t('gpuMemory') }}</h3>

      <p v-if="gpu.error" class="muted">{{ t('gpuUnavailable') }}（{{ gpu.error }}）</p>

      <template v-else>
        <div v-for="g in gpu.gpus" :key="g.index" class="gpu-row">
          <div class="gpu-line">
            <strong>{{ g.name }}</strong>
            <span class="muted">
              {{ g.usedMb }} / {{ g.totalMb }} MiB
              · {{ t('gpuFree') }} {{ g.freeMb }} MiB
              · {{ g.utilization }}%
            </span>
          </div>
          <div class="gpu-bar"><i :style="{ width: pct(g.usedMb, g.totalMb) }"></i></div>
          <!-- 剩不到 4G 就别让人盲目点加载了，直接把后果写出来 -->
          <p v-if="g.freeMb < 4096" class="chat-note err">{{ t('gpuTight') }}</p>
        </div>

        <table v-if="gpu.processes.length" class="gpu-procs">
          <thead>
            <tr><th>PID</th><th>{{ t('gpuProcess') }}</th><th>MiB</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in gpu.processes" :key="p.pid">
              <td class="muted">{{ p.pid }}</td>
              <td>{{ shortName(p.name) }}</td>
              <td>{{ p.usedMb }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>

    <!-- ── 已加载 ── -->
    <div class="card" style="margin-top:12px">
      <h3>{{ t('loadedModels') }}</h3>
      <p v-if="!running.length" class="muted">{{ t('noLoadedModel') }}</p>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('model') }}</th>
              <th>{{ t('vram') }}</th>
              <th>{{ t('ctxLen') }}</th>
              <th>{{ t('expiresAt') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in running" :key="m.name">
              <td><strong>{{ m.name }}</strong></td>
              <td>{{ m.sizeVram ? m.sizeVram + ' MiB' : '—' }}</td>
              <td>{{ m.contextLength || '—' }}</td>
              <td class="muted">{{ fmtTime(m.expiresAt) }}</td>
              <td>
                <button class="btn danger" type="button" :disabled="busy === m.name" @click="unload(m.name)">
                  {{ busy === m.name ? '…' : t('unload') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── 本机可加载 ── -->
    <div class="card" style="margin-top:12px">
      <h3>{{ t('localModels') }}</h3>
      <p v-if="!localModels.length" class="muted">{{ t('aiNoModel') }}</p>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('model') }}</th>
              <th>{{ t('params') }}</th>
              <th>{{ t('quant') }}</th>
              <th>{{ t('diskSize') }}</th>
              <th>{{ t('isDefault') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in localModels" :key="m.model">
              <td><strong>{{ m.model }}</strong></td>
              <td>{{ m.parameterSize || '—' }}</td>
              <td>{{ m.quantization || '—' }}</td>
              <td>{{ fmtSize(m.sizeBytes) }}</td>
              <td>
                <span v-if="m.id === catalog.defaultModel" class="status available">{{ t('yes') }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td>
                <button
                  class="btn"
                  type="button"
                  :disabled="isLoaded(m.model) || busy === m.model"
                  @click="loadModel(m.model)"
                >{{ busy === m.model ? '…' : (isLoaded(m.model) ? t('loaded') : t('load')) }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';

const catalog = reactive({ groups: [], defaultModel: '' });
const running = ref([]);
const gpu = reactive({ gpus: [], processes: [], error: '' });
const loading = ref(false);
const busy = ref('');
const error = ref('');

const localModels = computed(
  () => catalog.groups.find((g) => g.provider === 'ollama')?.models || []
);

function isLoaded(name) {
  return running.value.some((r) => r.name === name || r.name === `${name}:latest`);
}

/** 进程名是完整路径，表格里只留可执行文件名 */
function shortName(p) {
  return String(p || '').split('/').pop();
}

function pct(used, total) {
  if (!total) return '0%';
  return Math.min(100, Math.round((used / total) * 100)) + '%';
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString();
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    // 两个接口并行：目录（有哪些模型）+ 状态（显存与已加载）
    const [cat, st] = await Promise.all([
      request('/ai/models?refresh=1'),
      request('/ai/status')
    ]);
    Object.assign(catalog, { groups: cat.groups || [], defaultModel: cat.defaultModel || '' });
    running.value = st.running || [];
    Object.assign(gpu, st.gpu || { gpus: [], processes: [], error: '' });
    if (st.error) error.value = st.error;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadModel(name) {
  busy.value = name;
  error.value = '';
  try {
    await request(`/ai/models/${encodeURIComponent(name)}/load`, { method: 'POST' });
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = '';
    await refresh();
  }
}

async function unload(name) {
  busy.value = name;
  error.value = '';
  try {
    await request(`/ai/models/${encodeURIComponent(name)}/unload`, { method: 'POST' });
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = '';
    await refresh();
  }
}

onMounted(refresh);
</script>
