import { reactive, ref, watch } from 'vue';
import { request } from '../api/client.js';
import { getSchema } from '../config/adminSchemas.js';

/**
 * 管理台列表的通用 CRUD 状态机。一份逻辑服务 6 个菜单，菜单之间的差异全在 schema 里。
 *
 * @param {import('vue').Ref<string>|(() => string)} typeRef 当前菜单类型，可以是 ref 或 getter
 */
export function useAdminCrud(typeRef) {
  const rows = ref([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(10);
  const keyword = ref('');
  const loading = ref(false);
  const error = ref('');
  /** 筛选条件的当前值，键与 schema.filters[].key 一致 */
  const filters = reactive({});

  /**
   * 上一次真正发出去的 query 串。所有 watcher 在决定要不要 load 之前都拿它比一下。
   *
   * 为什么不用 `suspended` 布尔闸门：Vue 的 watch 回调默认是**异步**（pre-flush）的。
   * 切菜单时在回调里写 `suspended = true` → 改 page/keyword/filters → `suspended = false`
   * → `load()`，这三行是同步跑完的，而它想拦的那几个 watcher 要等到下一个微任务才触发——
   * 那时 `suspended` 早已变回 false，闸门形同虚设，一次切菜单照样打出 2~3 个重复请求。
   * 更糟的是重复请求各自 setState，慢的那个后到就会用旧菜单的数据覆盖新菜单。
   *
   * 改成比 query 串：幂等，且与 flush 时机完全无关——同一个 query 只可能 load 一次。
   */
  let lastQuery = '';

  const currentType = () => (typeof typeRef === 'function' ? typeRef() : typeRef.value);
  const schema = () => getSchema(currentType());

  /** 把筛选条件重置成 schema 里的默认值（select 默认空 = 全部） */
  function resetFilters() {
    for (const key of Object.keys(filters)) delete filters[key];
    for (const f of schema()?.filters || []) filters[f.key] = '';
  }

  function buildQuery() {
    const params = new URLSearchParams();
    params.set('page', String(page.value));
    params.set('pageSize', String(pageSize.value));
    if (keyword.value) params.set('keyword', keyword.value);
    for (const f of schema()?.filters || []) {
      const value = filters[f.key];
      if (value !== '' && value != null) params.set(f.key, String(value));
    }
    return params;
  }

  /**
   * 请求的唯一标识。**必须带上 endpoint**：两个菜单的 query 串可能一模一样
   * （都是 ?page=1&pageSize=10），只比 query 的话切菜单会被误判成"没变化"而漏加载。
   */
  function queryKey() {
    const s = schema();
    return s ? `${s.endpoint}?${buildQuery()}` : '';
  }

  /** 请求序号：连点翻页时保证只有最后一次请求的结果被采纳 */
  let seq = 0;

  async function load({ keepPage = false } = {}) {
    const s = schema();
    if (!s) return;
    const query = buildQuery().toString();
    lastQuery = queryKey();
    const mine = ++seq;
    loading.value = true;
    error.value = '';
    try {
      const data = await request(`${s.endpoint}?${query}`);
      // 迟到的旧响应直接丢弃，否则会用上一个菜单/上一页的数据覆盖当前视图
      if (mine !== seq) return;
      // 后端一律返回信封 { list, total, page, pageSize }
      rows.value = data?.list || [];
      total.value = data?.total ?? 0;
      if (!keepPage) page.value = data?.page ?? 1;
    } catch (e) {
      if (mine !== seq) return;
      error.value = e.message;
      rows.value = [];
      total.value = 0;
    } finally {
      if (mine === seq) loading.value = false;
    }
  }

  /** watcher 专用：请求目标没变就不重复请求（幂等，不依赖 flush 时机） */
  function loadIfChanged(options) {
    if (queryKey() === lastQuery) return;
    load(options);
  }

  /** 新建或更新。id 为空表示新建。成功后回到第 1 页刷新（新建的通常排在最前） */
  async function save(id, payload) {
    const s = schema();
    error.value = '';
    if (id) await request(`${s.endpoint}/${id}`, { method: 'PUT', body: payload });
    else await request(s.endpoint, { method: 'POST', body: payload });
    if (!id) page.value = 1;
    await load();
  }

  async function remove(id) {
    const s = schema();
    error.value = '';
    await request(`${s.endpoint}/${id}`, { method: 'DELETE' });
    // 删掉当页最后一条时要回退一页，否则会停在空白页
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  }

  async function runAction(action, row) {
    error.value = '';
    const { path, method } = action.request(row);
    await request(path, { method });
    await load({ keepPage: true });
  }

  /** 供搜索框/筛选控件调用：统一回到第 1 页，避免在第 5 页搜出空结果 */
  function search() {
    if (page.value !== 1) page.value = 1; // 交给 page 的 watcher 去加载
    else load();
  }

  // 换菜单：所有状态归零，否则会把上一个菜单的页码/筛选带过去。
  // 下面这几个赋值会连带触发后两个 watcher，但它们比 query 串会发现"没变化"而跳过，
  // 所以这里只管 load 一次。
  watch(
    () => currentType(),
    () => {
      page.value = 1;
      pageSize.value = 10;
      keyword.value = '';
      resetFilters();
      load();
    },
    { immediate: true }
  );

  // 翻页 / 改每页条数（load 回来的 page 会被服务端夹取，可能再触发一次，第二次即收敛）
  watch([page, pageSize], () => loadIfChanged({ keepPage: true }));

  // 筛选变化：先回第 1 页（由上面的 watcher 负责加载），已经在第 1 页时直接加载
  watch(filters, () => {
    if (page.value !== 1) page.value = 1;
    else loadIfChanged();
  });

  return {
    rows, total, page, pageSize, keyword, filters, loading, error,
    load, save, remove, runAction, resetFilters, search
  };
}
