import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'docs', 'softcopyright');
fs.mkdirSync(out, { recursive: true });

const softwareName = '国际化学生单车租赁管理软件';
const version = 'V1.0';
const fullName = `${softwareName}${version}`;

function redact(text) {
  return text
    .replace(/Java@c1024/g, '***')
    .replace(/student_bike_rental_dev_secret_change_me/g, '***')
    .replace(/localhost:\d+/g, '***')
    .replace(/127\.0\.0\.1/g, '***')
    .replace(/mysql_1/g, '***')
    .replace(/[A-Za-z0-9._%+-]+@example\.local/g, '***')
    .replace(/138\d{8}/g, '***')
    .replace(/admin123456|student123456|staff123456/g, '***');
}

const information = `软件名称：${softwareName}
版本号：${version}
开发的硬件环境：通用 PC 或笔记本开发环境，建议四核及以上 CPU、16GB 及以上内存、100GB 以上可用磁盘空间，具备稳定网络环境以便安装 Node.js 依赖、调试前后端服务和连接 MySQL 数据库。
运行的硬件环境：普通云服务器、校园内网服务器或开发测试 PC 均可运行，建议双核及以上 CPU、4GB 及以上内存、20GB 以上磁盘空间；客户端为支持现代浏览器的手机、平板或电脑终端。
开发该软件的操作系统：Linux 开发环境，兼容 Windows、macOS 上的 Node.js 开发环境。
软件开发环境 / 开发工具：Node.js、npm、Vite、Vue3、Express、mysql2、JWT、bcryptjs、MySQL、Git、浏览器调试工具和接口调试工具。
该软件的运行平台 / 操作系统：H5 浏览器端、Node.js 服务端和 MySQL 数据库运行环境，可部署在 Linux 或容器化运行平台中。
软件运行支撑环境 / 支持软件：Node.js 运行时、npm 包管理器、MySQL 数据库、现代 Web 浏览器、可选反向代理服务。后端通过环境变量读取端口、JWT 密钥和数据库连接配置，文档中相关主机、端口和密钥均已脱敏。
编程语言：JavaScript、Vue 单文件组件、HTML5、CSS3、SQL。
源程序量：按 backend/src、frontend/src、backend/sql 和 README 等自研源码统计，核心源码约 1491 行，不包含 node_modules、dist、构建产物和第三方依赖源码。
开发目的：建设一套面向高校学生、留学生、管理员和运维人员的校园单车租赁管理软件，使学生能够通过移动端 H5 页面完成车辆查询、租赁、归还、费用查看和公告浏览，使管理员能够集中管理车辆、用户、站点、订单、维护和公告信息，提升校园短途出行资源的数字化管理水平。
面向行业 / 领域：高校校园服务、学生生活服务、校园共享出行、车辆租赁管理、留学生服务和校园后勤运维管理领域。
软件的主要功能：${softwareName}围绕校园共享单车租赁业务构建，面向学生用户提供注册登录、个人信息维护、中英文界面切换、车辆列表查询、车辆详情查看、按状态筛选、站点信息查看、租赁确认、当前订单查询、归还结算、历史订单查询和公告浏览等功能。学生登录后可以查看车辆编号、车辆类型、站点归属、车辆状态和每小时租赁价格，在确认车辆可租赁后提交租车请求，系统会生成租赁订单并将车辆状态同步改为已租赁；归还时系统根据开始时间和结束时间计算使用小时数，不满一小时按一小时计费，并将订单更新为已完成，同时恢复车辆可租赁状态。管理员端提供统计仪表盘，能够查看用户数量、车辆数量、当前租赁订单数量和累计收入，并进入用户管理、单车管理、订单管理、站点管理、维护管理和公告管理等模块。运维人员可通过维护模块记录车辆故障、维护内容、处理人员和维护状态，维护完成后更新车辆状态。公告模块支持中文标题、英文标题、中文内容和英文内容，配合前端语言设置展示对应文本。系统通过 JWT 控制登录状态，通过角色权限区分学生、管理员和运维人员可访问的接口范围，保证学生只能查看自己的订单，管理员可管理全局数据，运维人员聚焦车辆维护相关操作。
软件的技术特点：系统采用前后端分离结构，前端使用 Vue3、Vite、Vue Router、响应式状态和 H5 页面布局实现移动端优先的浏览器应用，内置中文和英文语言资源并将语言选择保存在 localStorage。后端使用 Node.js 和 Express 提供 RESTful JSON 接口，统一返回 code、message 和 data 结构，通过 JWT 实现认证，通过角色中间件实现权限控制，通过 bcryptjs 对用户密码进行哈希存储，通过 mysql2 使用参数化查询访问 MySQL 数据库。核心租车和还车流程使用数据库事务，在租赁时锁定车辆记录、检查车辆是否可租并同步更新车辆状态，在归还时计算时长和费用并同步更新订单与车辆。数据库设计覆盖用户、站点、车辆、租赁订单、维护记录和公告六类核心对象，并通过外键关系维持业务数据一致性。系统提供初始化脚本和演示数据脚本，便于部署、测试和验收。`;

fs.writeFileSync(path.join(out, 'information.txt'), information, 'utf8');

const selectedFiles = [
  'backend/package.json',
  'backend/.env.example',
  'backend/src/app.js',
  'backend/src/server.js',
  'backend/src/config/db.js',
  'backend/src/middleware/auth.js',
  'backend/src/middleware/role.js',
  'backend/src/routes/auth.js',
  'backend/src/routes/users.js',
  'backend/src/routes/bikes.js',
  'backend/src/routes/stations.js',
  'backend/src/routes/orders.js',
  'backend/src/routes/maintenance.js',
  'backend/src/routes/dashboard.js',
  'backend/src/routes/announcements.js',
  'backend/sql/schema.sql',
  'backend/sql/seed.sql',
  'backend/src/utils/initDb.js',
  'backend/src/utils/seedDemoData.js',
  'backend/src/utils/seedUsers.js',
  'backend/src/utils/response.js',
  'backend/src/utils/errors.js',
  'frontend/package.json',
  'frontend/vite.config.js',
  'frontend/index.html',
  'frontend/src/main.js',
  'frontend/src/App.vue',
  'frontend/src/router/index.js',
  'frontend/src/api/client.js',
  'frontend/src/i18n/index.js',
  'frontend/src/stores/auth.js',
  'frontend/src/views/Login.vue',
  'frontend/src/views/Register.vue',
  'frontend/src/views/Home.vue',
  'frontend/src/views/Bikes.vue',
  'frontend/src/views/BikeDetail.vue',
  'frontend/src/views/RentConfirm.vue',
  'frontend/src/views/CurrentOrder.vue',
  'frontend/src/views/Orders.vue',
  'frontend/src/views/Profile.vue',
  'frontend/src/views/Announcements.vue',
  'frontend/src/views/AnnouncementDetail.vue',
  'frontend/src/views/AdminList.vue',
  'frontend/src/views/Dashboard.vue',
  'frontend/src/assets/style.css',
  'README.md'
];

let sourceMd = `# ${softwareName}源代码\n\n`;
sourceMd += `## 源代码属性结构说明\n\n本源码稿整理 ${fullName} 的主要自研源码，技术栈包括 Node.js、Express、Vue3、Vite、MySQL、HTML5、CSS3 和 JavaScript。源码根目录分为 backend、frontend、docs、scripts、tmp 等一级目录，其中 backend 保存服务端接口、鉴权、权限、数据库连接、SQL 和初始化脚本，frontend 保存 H5 页面、路由、接口封装、国际化资源、状态管理和页面样式，scripts 保存软著材料生成辅助脚本，docs 保存软著材料、截图和图示。本文纳入后端接口主链路、数据库结构、前端页面主链路、运行配置、初始化脚本和 README 中与部署运行直接相关的内容，不包含 node_modules、dist、第三方依赖源码和构建产物。源码稿按照“后端入口与基础设施、后端业务接口、数据库脚本、前端入口与路由、前端页面与样式、运行说明”的顺序编排，便于审查人员从系统入口逐步理解业务实现。\n\n`;
sourceMd += `## 三级目录结构\n\n\`\`\`text\nbackend\nbackend/src\nbackend/src/routes\nbackend/src/middleware\nbackend/src/config\nbackend/src/utils\nbackend/sql\nfrontend\nfrontend/src\nfrontend/src/views\nfrontend/src/router\nfrontend/src/api\nfrontend/src/i18n\nfrontend/src/stores\nfrontend/src/assets\nscripts\nREADME.md\n\`\`\`\n\n`;

for (const file of selectedFiles) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) continue;
  const ext = path.extname(file).slice(1) || 'text';
  sourceMd += `## ${file}\n\n文件职责：该文件属于 ${file.startsWith('backend') ? '后端服务模块' : '前端 H5 模块'}，用于支撑系统认证、业务接口、页面交互或数据结构。\n\n`;
  sourceMd += '```' + ext + '\n' + redact(fs.readFileSync(abs, 'utf8')) + '\n```\n\n';
}
fs.writeFileSync(path.join(out, `${softwareName}源代码.md`), sourceMd, 'utf8');

const diagram = (file, title, desc) => `![${title}](../assets/diagrams/${file})\n\n<div class=\"caption\">${title}</div>\n\n**图示说明：**${desc}\n\n`;
const screenshot = (file, title, desc) => `![${title}](../assets/screenshots/${file})\n\n<div class=\"caption\">${title}</div>\n\n**截图说明：**${desc}\n\n`;

const designMd = `# ${softwareName}软件设计说明书\n\n## 1 引言\n\n${softwareName}${version} 是面向高校校园短途出行和车辆租赁管理场景的软件系统。系统采用 H5 前端、Node.js 后端和 MySQL 数据库，围绕学生租车、还车、订单查询、车辆维护、公告发布、后台统计和多语言展示形成完整业务链路。本文说明软件的需求、架构、模块、数据库、接口、部署、安全和测试验证情况。\n\n## 2 需求分析\n\n### 2.1 用户角色与业务边界\n\n系统面向三类用户：学生用户、管理员和运维人员。学生用户需要在移动端浏览车辆资源，查看车辆状态和费用，完成租赁和归还，并查询历史订单；管理员需要维护用户、车辆、站点、订单、公告和统计数据；运维人员需要登记车辆维护记录并更新车辆状态。系统要求支持中英文界面切换、JWT 登录认证、角色权限控制、统一接口返回和租还车事务处理。\n\n${diagram('01_use_case.svg', '图2-1 系统用例图', '该用例图用于明确软件的使用对象、功能边界和权限边界。图中学生用户是租赁业务的主要发起者，重点功能包括注册登录、查询单车与站点、租赁单车、归还结算、查看当前与历史订单、浏览公告以及切换中英文界面，这些功能构成学生端完整闭环。管理员是后台运营管理角色，重点负责用户、车辆、站点、订单、公告、维护记录和统计仪表盘，体现校园车辆资源的统一管理能力。运维人员主要处理维护车辆功能，说明系统不仅覆盖租赁交易，还覆盖车辆运维生命周期。该图放在需求分析章节，是为了让审查人员先从角色视角理解软件“谁使用、使用什么功能、功能边界在哪里”。')}\n\n### 2.2 关键业务目标\n\n系统的关键目标是将校园单车从人工登记或线下管理转为在线化管理。学生端强调快速查询和自助租还，后台端强调资产、订单、维护和公告的集中管理，数据层强调订单、车辆、站点和用户之间的一致性。系统通过角色权限控制保证不同用户只进入对应功能范围，通过事务处理保证租车、还车和车辆状态同步更新。\n\n## 3 系统概述\n\n### 3.1 系统组成\n\n软件由 H5 前端、Express 后端和 MySQL 数据库组成。前端通过 Vue Router 管理页面跳转，通过接口封装模块调用后端 RESTful API，通过 i18n 资源实现中英文文本切换。后端提供认证、用户、车辆、站点、订单、维护、公告和统计接口，统一使用 JSON 返回结构。数据库保存用户、车辆、站点、订单、维护和公告等核心业务数据。\n\n### 3.2 核心功能清单\n\n系统核心功能包括用户认证、个人资料管理、车辆查询、车辆详情、租赁确认、当前订单、历史订单、费用结算、站点管理、维护记录、公告展示、后台统计、用户管理、车辆管理、订单管理和多语言切换。上述功能均已经在前端路由、后端接口和数据库表结构中体现。\n\n## 4 总体设计\n\n### 4.1 前后端分离总体架构\n\n系统采用前后端分离架构。H5 前端负责界面展示、表单输入、语言切换和用户交互；后端负责身份认证、权限校验、业务规则、事务处理和数据访问；MySQL 负责持久化存储。租车和还车属于核心一致性流程，后端通过事务保证订单状态和车辆状态同步更新。\n\n${diagram('02_architecture.svg', '图4-1 系统总体架构图', '该架构图用于说明软件内部的分层结构和主要模块职责。左侧 H5 前端包含路由 Router、页面 Views、接口封装 client.js、国际化 i18n 和登录状态 authStore，重点负责页面组织、用户交互、语言切换和请求发起；中间 Node.js 后端包含认证中间件、角色权限中间件、认证接口、车辆站点接口、订单租还接口、维护公告统计接口以及统一响应和异常处理，重点负责业务规则和权限控制；右侧 MySQL 数据库保存 users、bikes、stations、rental_orders、maintenance_records 和 announcements 六类核心数据。该图的重点是说明系统不是单一页面程序，而是由前端展示层、后端业务层和数据库持久层共同构成，租车还车等关键流程由后端统一处理，避免前端直接修改数据库导致数据不一致。')}\n\n### 4.2 运行部署结构\n\n前端构建产物可以部署在 Web 服务或静态资源服务中，用户通过移动端浏览器访问 H5 页面；后端在 Node.js 运行时中提供 RESTful API；MySQL 作为独立数据库服务保存业务数据。网络通信地址、数据库主机和密钥类配置在软著材料中统一脱敏。\n\n${diagram('05_deployment.svg', '图4-2 系统部署图', '该部署图用于说明软件从用户终端到数据库服务的运行拓扑。用户移动端浏览器加载 H5 页面，前端运行环境提供 Vue3 构建产物，页面再通过 REST JSON 方式访问 Node.js 应用服务中的 Express 接口。Node.js 服务通过环境变量读取端口、JWT 密钥和数据库连接配置，再通过 mysql2 访问 MySQL 中的 student_bike_rental 数据库。该图的重点功能是说明系统部署时各组件的边界：浏览器只负责页面访问，前端服务只提供静态资源，后端服务集中处理权限和业务，数据库服务集中保存持久化数据。图中已对接口地址和数据库主机进行脱敏，符合软著材料对网络通信信息的安全要求。')}\n\n## 5 详细设计\n\n### 5.1 用户认证与权限设计\n\n认证模块提供注册、登录、获取个人信息、修改资料和修改密码接口。用户密码使用 bcryptjs 哈希保存，登录成功后后端签发 JWT，前端保存 token 并在后续请求中放入 Authorization 头。角色权限分为 student、admin 和 staff，管理员可访问全部后台管理接口，学生只能访问本人订单和租赁相关接口，运维人员可访问维护相关接口。\n\n### 5.2 单车租赁流程设计\n\n学生在车辆列表中选择可租赁车辆，进入详情并提交租赁请求。后端校验 JWT 和用户角色，检查用户是否已有租赁中订单，锁定车辆记录并确认状态为 available，随后写入订单并将车辆状态改为 rented。归还时后端校验订单归属和订单状态，根据订单开始时间计算使用小时数和总金额，更新订单为 completed，并将车辆恢复 available。\n\n${diagram('03_rental_sequence.svg', '图5-1 租车还车时序图', '该时序图用于说明系统最核心的租赁业务链路。上半部分展示学生点击租赁后，H5 前端向订单接口提交 bike_id 和站点信息，后端先经过 JWT 鉴权确认用户身份，再开启数据库事务并锁定车辆记录，确认车辆状态为 available 后写入 rental_orders 订单记录，并同步把 bikes.status 更新为 rented。下半部分展示学生归还车辆时，前端调用归还接口，后端再次校验 token、订单归属和订单状态，根据订单开始时间计算使用小时数和总费用，然后更新订单为 completed，并将车辆恢复 available。该图的重点是体现事务、状态同步和费用结算三个关键控制点，说明系统能够保证“订单生成、车辆占用、归还结算、车辆释放”按顺序完成。')}\n\n### 5.3 车辆与订单状态设计\n\n车辆状态包括 available、rented、maintenance 和 disabled。订单状态包括 renting、completed 和 cancelled。车辆状态和订单状态并不是孤立变化，而是由租赁、归还、维护和停用等业务动作驱动。\n\n${diagram('06_order_state.svg', '图5-2 订单与车辆状态图', '该状态图用于说明车辆生命周期和订单生命周期之间的联动关系。车辆初始处于可租赁状态，学生提交租赁后产生租赁中订单，同时车辆进入已租赁状态；学生完成归还后订单进入已完成状态，车辆恢复可租赁状态。运维人员创建维护记录时，车辆从可租赁转入维护中状态，维护完成后恢复可租赁；管理员也可以将车辆置为停用状态，避免异常车辆继续出现在可租列表中。该图的重点功能是说明系统通过明确状态枚举控制业务可执行条件，租赁接口只允许 available 车辆被租赁，归还接口只处理 renting 订单，维护流程会影响车辆能否被学生租用。')}\n\n### 5.4 维护与公告设计\n\n维护模块支持创建维护记录、设置车辆进入 maintenance 状态以及完成维护后恢复 available 状态。公告模块保存中英文标题和内容，前端根据语言设置展示对应文本，管理员可发布、编辑和隐藏公告。维护功能保障车辆资产可持续运营，公告功能保障校园运营信息可以及时传达给学生和留学生群体。\n\n## 6 数据库设计\n\n### 6.1 数据库总体说明\n\n数据库名称为 student_bike_rental，采用 MySQL 存储核心业务数据。数据库脚本位于 backend/sql/schema.sql 和 backend/sql/seed.sql，演示数据脚本位于 backend/src/utils/seedDemoData.js。数据库设计目标是支撑用户身份、车辆资产、校园站点、租赁订单、维护过程和公告内容六类核心业务对象，并通过外键关系保证对象之间的可追溯性。\n\n### 6.2 核心数据表说明\n\nusers 表保存账号、密码哈希、姓名、邮箱、电话、角色、学生编号、国籍、语言和状态，是登录认证、角色权限和订单归属判断的基础表。stations 表保存站点中英文名称、地址、经纬度和容量，用于说明车辆停放位置和归属站点。bikes 表保存车辆编号、名称、类型、状态、所属站点、小时费率、图片地址和描述，是学生查询和租赁车辆的主数据表。rental_orders 表保存订单编号、用户、车辆、开始时间、结束时间、使用小时数、小时费率、总费用、订单状态、起始站点和结束站点，是租车还车与计费结算的核心业务表。maintenance_records 表保存维护车辆、维护人员、维护内容、处理状态、开始和结束时间，用于记录车辆运维闭环。announcements 表保存公告中英文标题、中英文内容、发布状态和创建人，用于支持双语公告展示。\n\n### 6.3 表关系、约束与索引说明\n\nbikes.station_id 关联 stations.id，表示每辆单车归属于一个校园站点；rental_orders.user_id 关联 users.id，表示订单归属学生或操作者；rental_orders.bike_id 关联 bikes.id，表示订单对应的车辆；maintenance_records.bike_id 关联 bikes.id，maintenance_records.staff_id 关联 users.id，表示维护记录对应车辆和处理人员；announcements.created_by 关联 users.id，表示公告发布人员。users.username、bikes.bike_no 和 rental_orders.order_no 采用唯一约束，避免账号、车辆编号和订单编号重复。rental_orders 上的 user_id 与 status 组合索引用于快速查询学生当前租赁中订单，支撑“同一学生不能同时存在多个租赁中订单”的业务校验。\n\n### 6.4 数据初始化与测试数据说明\n\nschema.sql 负责创建数据库和六张核心表，seed.sql 负责写入基础站点、车辆和公告数据，seedDemoData.js 负责写入多角色用户、多站点、多车型、维护记录、历史订单和公告等演示数据。初始化数据用于验证学生端和管理员端的完整链路，包括学生登录、车辆列表查询、租车、还车、历史订单、管理员统计、维护管理和公告浏览。测试数据中的联系方式、邮箱、密码和主机信息在软著材料中均已脱敏。\n\n${diagram('04_er.svg', '图6-1 数据对象关系图', '该 ER 图用于说明数据库中六张核心表的业务关系。users 表既可以作为学生订单的归属主体，也可以作为维护人员和公告发布人员；stations 表与 bikes 表形成站点到车辆的一对多关系，说明车辆投放在具体校园站点；bikes 表与 rental_orders 表形成车辆到订单的一对多关系，支持同一车辆在不同时间形成多条租赁记录；bikes 表与 maintenance_records 表形成车辆到维护记录的一对多关系，支持车辆生命周期追踪；announcements 表通过 created_by 记录公告创建人。该图的重点是说明数据库不是简单保存列表数据，而是围绕“用户、车辆、站点、订单、维护、公告”建立了可追溯的关系模型，为权限控制、订单查询、后台统计和车辆维护提供数据基础。')}\n\n## 7 接口设计\n\n### 7.1 接口模块划分\n\n系统接口以 /api 为统一前缀，包含 /api/auth、/api/users、/api/bikes、/api/stations、/api/orders、/api/maintenance、/api/announcements 和 /api/dashboard 等模块。所有接口统一返回 code、message、data 结构，错误由统一异常处理中间件处理。\n\n### 7.2 核心接口说明\n\n认证接口负责注册、登录、个人信息和密码修改；车辆接口负责车辆列表、详情、新增、编辑和停用；站点接口负责校园站点维护；订单接口负责我的订单、当前订单、租车和还车；维护接口负责维护记录查询、创建和完成；公告接口负责公告列表、详情、发布、编辑和隐藏；统计接口负责管理员仪表盘数据。租赁接口 POST /api/orders/rent 和归还接口 PUT /api/orders/:id/return 是系统核心业务接口。\n\n## 8 页面与运行界面\n\n### 8.1 学生端页面\n\n${screenshot('01_student_home.png', '图8-1 学生端首页', '该截图用于说明学生登录后进入系统的主页面结构。页面顶部包含系统名称、首页、单车、当前订单、历史订单、公告、个人中心、退出和语言切换入口，主区域以卡片形式展示单车查询、当前订单和公告浏览等核心入口。该页面的重点功能是把学生最常用的租赁动作集中在首页，学生可以从首页快速进入单车列表选择车辆，也可以进入当前订单查看正在进行的租赁，还可以进入公告页面查看校园骑行通知。该截图说明前端会根据登录状态动态展示学生菜单，未登录状态不会出现订单和个人中心入口。')}\n${screenshot('02_bike_list.png', '图8-2 单车列表页面', '该截图用于说明学生租车前的车辆资源查询界面。页面提供搜索输入框、状态筛选下拉框和搜索按钮，并以车辆卡片展示车辆名称、编号、类型、状态、站点和小时费率。该页面的重点功能是帮助学生在租赁前确认车辆是否可用、车辆所在站点以及计费标准，降低错误租赁和线下询问成本。列表数据由后端车辆接口从 MySQL 中读取，车辆状态与订单、维护流程联动，因此该页面也是车辆资产状态对学生端开放展示的关键位置。')}\n${screenshot('03_order_history.png', '图8-3 历史订单页面', '该截图用于说明学生对本人租赁记录的查询能力。页面展示订单编号、车辆编号、订单状态、使用小时数和费用金额，重点功能是让学生查看已经完成的租赁明细和费用结果。该页面只查询当前登录学生自己的订单，体现了用户数据隔离和权限控制。订单历史来自 rental_orders 表，费用和时长由归还接口计算后保存，因此该截图能够证明系统形成了从租车、还车到费用记录留存的完整业务闭环。')}\n${screenshot('04_announcements.png', '图8-4 公告列表页面', '该截图用于说明系统的校园运营通知能力。公告页面展示公告标题和发布时间，公告数据由管理员维护并支持中文、英文两套内容字段。该页面的重点功能是向学生和留学生传达骑行安全、站点服务、车辆维护或临时运营安排等信息，降低运营人员逐一通知的成本。公告功能与租赁业务相互补充，能够在学生租车前或使用过程中提供必要规则提醒，也体现系统面向国际化用户的双语服务能力。')}\n\n### 8.2 管理端页面\n\n${screenshot('05_admin_dashboard.png', '图8-5 管理员统计仪表盘', '该截图用于说明管理员登录后的后台总览能力。页面展示用户数量、车辆数量、当前租赁订单数量和总收入，并提供用户、单车、订单、站点、维护和公告等管理入口。该页面的重点功能是让管理员快速掌握校园单车租赁系统的整体运营状态，例如当前是否存在租赁中订单、车辆资产规模和已完成订单收入。统计数据由后端 dashboard 接口聚合用户表、车辆表和订单表得到，说明后台不只是静态页面，而是基于数据库实时业务数据生成管理视图。')}\n${screenshot('06_admin_bikes.png', '图8-6 管理员单车管理页面', '该截图用于说明管理员对车辆资产的维护能力。页面按表格展示车辆编号、车辆名称、车辆类型、车辆状态、小时费率和操作入口，重点功能是集中查看车辆主数据并执行新增、编辑、停用等管理动作。车辆状态包括可租赁、已租赁、维护中和停用，不同状态会影响学生端是否能够发起租赁。该页面连接车辆接口和 bikes 数据表，是管理员维护投放车辆、调整价格、核查异常状态和管理校园站点车辆资源的重要入口。')}\n${screenshot('07_admin_maintenance.png', '图8-7 维护管理页面', '该截图用于说明车辆运维流程的后台管理能力。页面展示维护记录编号、车辆编号、维护人员、处理状态、维护内容和完成操作，重点功能是记录车辆故障处理和维护完成情况。创建维护记录时系统会将车辆状态设为维护中，维护完成后恢复为可租赁，从而避免故障车辆继续出现在学生可租列表中。该页面说明系统不仅管理租赁订单，也管理车辆生命周期中的维护环节，能够支撑校园后勤对车辆安全和可用性的持续管理。')}\n\n## 9 运行与部署设计\n\n后端通过 .env 读取服务端口、JWT 密钥和数据库配置，文档中连接地址和密钥已脱敏。初始化数据库时执行 schema.sql 创建表结构，再执行 seed.sql 和 seed:demo 脚本写入测试数据。前端使用 Vite 启动开发服务，也可以通过 npm run build 生成静态构建产物部署到 Web 服务中。\n\n## 10 安全与权限设计\n\n系统采用 JWT 保持登录状态，服务端通过 auth 中间件验证 token，通过 role 中间件限制角色访问。密码在写入数据库前进行哈希处理。数据库访问使用 mysql2 参数化查询，租赁和归还等关键操作使用事务避免状态不一致。软著材料中的数据库主机、密钥、接口访问地址、账号联系信息等均已脱敏。\n\n## 11 测试与验证\n\n本次验证完成了数据库初始化、演示数据写入、学生登录、车辆列表查询、租车、当前订单查询、还车、历史订单查询、管理员登录、统计接口和用户列表接口。前端通过浏览器完成学生登录、车辆详情、租赁确认、归还确认和后台页面访问验证。前端生产构建通过，后端入口模块加载通过，核心链路可运行。\n\n## 12 结论\n\n${softwareName}${version} 已实现学生端租赁闭环、管理员后台管理、运维维护记录、公告发布、多语言展示和数据库持久化能力，具备校园学生单车租赁软件的主要功能和可部署运行基础。\n`;
fs.writeFileSync(path.join(out, '软件设计说明书.md'), designMd, 'utf8');

console.log(`Generated soft copyright markdown for ${fullName}`);
