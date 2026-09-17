/**
 * 管理台 6 个菜单的声明式配置。
 *
 * 每个菜单过去在 AdminList.vue 里各写一份 headerMap / 各写一份 handleXxx，
 * 6 个菜单就是 6 份近似重复的代码，加一个字段要改三个地方。现在收敛成数据：
 * AdminTable / AdminFormDialog 只认这份配置，新增菜单 = 新增一个 schema 对象。
 *
 * ── 字段说明 ──────────────────────────────────────────────
 * endpoint     后端路径（列表 GET / 新建 POST / 更新 PUT /:id / 删除 DELETE /:id）
 * columns      表格列。key 落到行的哪个字段；type 决定渲染方式：
 *                'text'(默认) | 'status'(走 .status 徽章) | 'datetime'(截断到分钟)
 * filters      筛选控件。type: 'select' | 'date'
 * form         表单字段。type: 'text' | 'password' | 'number' | 'textarea' | 'select'
 *                options        静态选项 [{ value, labelKey }]
 *                optionsFrom    动态选项 { path, value, label }，label 是个函数
 *                createOnly     只在新建时出现（如 username）
 *                requiredOnCreate / required  必填校验
 * canCreate / canEdit / canDelete   写能力开关
 * rowActions   行内额外按钮（如"完成维护"）
 *
 * ── 注意 ──────────────────────────────────────────────────
 * 后端的 PUT 都是"部分更新"语义（未传的字段保留原值），所以表单必须提交**全量**字段，
 * 否则用户改一个字段就会把其它字段留成旧值——不会出错，但会让人以为没保存上。
 * 这里所有字段在任何模式下都会提交，只有 createOnly 字段在编辑时跳过。
 */

const ROLE_OPTIONS = [
  { value: 'student', labelKey: 'student' },
  { value: 'admin', labelKey: 'admin' },
  { value: 'staff', labelKey: 'staff' }
];

const USER_STATUS_OPTIONS = [
  { value: 'active', labelKey: 'active' },
  { value: 'disabled', labelKey: 'disabled' }
];

const BIKE_STATUS_OPTIONS = [
  { value: 'available', labelKey: 'available' },
  { value: 'rented', labelKey: 'rented' },
  { value: 'maintenance', labelKey: 'maintenanceStatus' },
  { value: 'disabled', labelKey: 'disabled' }
];

// 取值必须和库里已有的数据一致。实测 bikes.type 的分布是 standard/city/sport，
// 之前这里写的 electric/mountain 是凭空猜的，会导致筛选下拉选不出任何结果。
const BIKE_TYPE_OPTIONS = [
  { value: 'standard', labelKey: 'standard' },
  { value: 'city', labelKey: 'city' },
  { value: 'sport', labelKey: 'sport' }
];

const ORDER_STATUS_OPTIONS = [
  { value: 'renting', labelKey: 'renting' },
  { value: 'completed', labelKey: 'completed' },
  { value: 'cancelled', labelKey: 'cancelled' }
];

const MAINTENANCE_STATUS_OPTIONS = [
  { value: 'processing', labelKey: 'processing' },
  { value: 'finished', labelKey: 'finished' }
];

const ANNOUNCEMENT_STATUS_OPTIONS = [
  { value: 'published', labelKey: 'published' },
  { value: 'hidden', labelKey: 'hidden' }
];

export const adminSchemas = {
  /* ── 用户 ─────────────────────────────────────────────── */
  users: {
    titleKey: 'users',
    endpoint: '/users',
    columns: [
      { key: 'id' },
      { key: 'username' },
      { key: 'name' },
      { key: 'role', type: 'status' },
      { key: 'status', type: 'status' },
      { key: 'email' },
      { key: 'student_no' },
      { key: 'created_at', type: 'datetime' }
    ],
    filters: [
      { key: 'role', type: 'select', options: ROLE_OPTIONS },
      { key: 'status', type: 'select', options: USER_STATUS_OPTIONS }
    ],
    form: [
      { key: 'username', type: 'text', createOnly: true, requiredOnCreate: true, minLength: 3 },
      { key: 'password', type: 'password', createOnly: true, requiredOnCreate: true, minLength: 6 },
      { key: 'name', type: 'text' },
      { key: 'email', type: 'text' },
      { key: 'phone', type: 'text' },
      { key: 'student_no', type: 'text' },
      { key: 'nationality', type: 'text' },
      { key: 'role', type: 'select', options: ROLE_OPTIONS, requiredOnCreate: true },
      { key: 'status', type: 'select', options: USER_STATUS_OPTIONS, requiredOnCreate: true }
    ],
    canCreate: true,
    canEdit: true,
    canDelete: true,
    deleteHintKey: 'deleteUserHint'
  },

  /* ── 单车 ─────────────────────────────────────────────── */
  bikes: {
    titleKey: 'bikes',
    endpoint: '/bikes',
    columns: [
      { key: 'id' },
      { key: 'bike_no' },
      { key: 'name' },
      { key: 'type', type: 'enum' },
      { key: 'status', type: 'status' },
      { key: 'station_name_zh', labelKey: 'station' },
      { key: 'hourly_rate' }
    ],
    filters: [
      { key: 'status', type: 'select', options: BIKE_STATUS_OPTIONS },
      { key: 'type', type: 'select', options: BIKE_TYPE_OPTIONS }
    ],
    form: [
      { key: 'bike_no', type: 'text', required: true },
      { key: 'name', type: 'text' },
      // 站点下拉的数据来自 /stations，选项在打开弹框时异步拉取
      {
        key: 'station_id',
        labelKey: 'station',
        type: 'select',
        optionsFrom: {
          path: '/stations',
          value: (row) => row.id,
          label: (row, lang) => (lang === 'zh-CN' ? row.name_zh : row.name_en)
        }
      },
      { key: 'type', type: 'select', options: BIKE_TYPE_OPTIONS },
      { key: 'status', type: 'select', options: BIKE_STATUS_OPTIONS, requiredOnCreate: true },
      // hourly_rate 在库里是 NOT NULL，新建时必须给值，否则会插 NULL 报错
      { key: 'hourly_rate', type: 'number', requiredOnCreate: true, step: '0.01' },
      { key: 'image_url', type: 'text' },
      { key: 'description', type: 'textarea' }
    ],
    canCreate: true,
    canEdit: true,
    canDelete: true,
    deleteHintKey: 'deleteBikeHint'
  },

  /* ── 订单（只读）──────────────────────────────────────── */
  // 后端没有订单的增删改接口：订单由租/还流程产生，管理员不该凭空造订单。
  orders: {
    titleKey: 'orders',
    endpoint: '/orders',
    columns: [
      { key: 'id' },
      { key: 'order_no' },
      { key: 'username' },
      { key: 'bike_no' },
      { key: 'status', type: 'status' },
      { key: 'duration_hours' },
      { key: 'total_amount' },
      { key: 'start_time', type: 'datetime' },
      { key: 'end_time', type: 'datetime' }
    ],
    filters: [
      { key: 'status', type: 'select', options: ORDER_STATUS_OPTIONS },
      { key: 'from', type: 'date', labelKey: 'fromDate' },
      { key: 'to', type: 'date', labelKey: 'toDate' }
    ],
    form: [],
    canCreate: false,
    canEdit: false,
    canDelete: false
  },

  /* ── 站点 ─────────────────────────────────────────────── */
  stations: {
    titleKey: 'stations',
    endpoint: '/stations',
    columns: [
      { key: 'id' },
      { key: 'name_zh' },
      { key: 'name_en' },
      { key: 'address_zh' },
      { key: 'capacity' },
      { key: 'available_count' },
      { key: 'bike_count' }
    ],
    filters: [],
    form: [
      { key: 'name_zh', type: 'text', required: true },
      { key: 'name_en', type: 'text', required: true },
      { key: 'address_zh', type: 'text' },
      { key: 'address_en', type: 'text' },
      { key: 'latitude', type: 'number', step: '0.0000001' },
      { key: 'longitude', type: 'number', step: '0.0000001' },
      { key: 'capacity', type: 'number' }
    ],
    canCreate: true,
    canEdit: true,
    canDelete: true,
    deleteHintKey: 'deleteStationHint'
  },

  /* ── 维护 ─────────────────────────────────────────────── */
  maintenance: {
    titleKey: 'maintenance',
    endpoint: '/maintenance',
    columns: [
      { key: 'id' },
      { key: 'bike_no' },
      { key: 'staff_name' },
      { key: 'status', type: 'status' },
      { key: 'content' },
      { key: 'start_time', type: 'datetime' },
      { key: 'end_time', type: 'datetime' }
    ],
    filters: [{ key: 'status', type: 'select', options: MAINTENANCE_STATUS_OPTIONS }],
    form: [
      {
        key: 'bike_id',
        labelKey: 'bike',
        type: 'select',
        required: true,
        optionsFrom: {
          path: '/bikes',
          value: (row) => row.id,
          label: (row) => `${row.bike_no}${row.name ? ` · ${row.name}` : ''}`
        }
      },
      { key: 'content', type: 'textarea', required: true }
    ],
    // 没有通用更新接口，只有 /:id/finish；内容填错了只能删掉重开
    canCreate: true,
    canEdit: false,
    canDelete: true,
    deleteHintKey: 'deleteMaintenanceHint',
    rowActions: [
      {
        key: 'finish',
        labelKey: 'finish',
        visible: (row) => row.status === 'processing',
        confirmKey: 'confirmFinish',
        request: (row) => ({ path: `/maintenance/${row.id}/finish`, method: 'PUT' })
      }
    ]
  },

  /* ── 公告 ─────────────────────────────────────────────── */
  announcements: {
    titleKey: 'announcements',
    endpoint: '/announcements',
    columns: [
      { key: 'id' },
      { key: 'title_zh' },
      { key: 'title_en' },
      { key: 'status', type: 'status' },
      { key: 'created_at', type: 'datetime' }
    ],
    filters: [{ key: 'status', type: 'select', options: ANNOUNCEMENT_STATUS_OPTIONS }],
    form: [
      { key: 'title_zh', type: 'text', required: true },
      { key: 'title_en', type: 'text', required: true },
      { key: 'content_zh', type: 'textarea' },
      { key: 'content_en', type: 'textarea' },
      { key: 'status', type: 'select', options: ANNOUNCEMENT_STATUS_OPTIONS, requiredOnCreate: true }
    ],
    canCreate: true,
    canEdit: true,
    canDelete: true,
    deleteHintKey: 'deleteAnnouncementHint'
  }
};

export function getSchema(type) {
  return adminSchemas[type] || null;
}
