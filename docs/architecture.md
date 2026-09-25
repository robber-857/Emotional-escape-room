# 情感密室：项目架构设计

日期：2026-09-25。状态：开发前设计草案。范围与证据见 [需求登记](requirements-register.md)。

## 1. 目标与边界

开发一个可以从入口完整玩到结果页的单人网页游戏，而非四张可点击的静态设计稿。四幕通过出口、入口、物品和过场保持叙事连续。

用户已确认：Next.js + React、FastAPI、Eltondev → PR → MVP_branch、George 部署、手机横屏适配、不使用 absolute 等固定页面定位、可改事件分值、关卡权重 2:3:3:2、L2 四组全做且每局四组全部提供、首版不做真人匹配。

工程建议：TypeScript、CSS Modules、PostgreSQL、SQLAlchemy + Alembic、Pydantic。采用单仓库、前后端分离、后端模块化单体。首版不引入微服务、消息队列、WebSocket 或独立分析平台；需要这些能力时再增加。依赖具体版本在初始化时选择兼容稳定版本并锁定，不在规划中猜测版本号。

## 2. 系统边界

~~~mermaid
flowchart LR
    Player["浏览器：桌面 / 手机横屏"] --> Web["Next.js：页面、交互、场景渲染"]
    Web -->|"动作 + 幂等键 + 预期状态版本"| API["FastAPI：校验与状态推进"]
    API --> Engine["关卡状态机 + 行为归类 + 评分引擎"]
    Engine --> DB[("PostgreSQL")]
    API -->|"权威状态 / 结果"| Web
    Release["版本化内容与评分配置"] --> Engine
    Assets["静态图片 / 音效"] --> Web
~~~

Next.js 负责页面、资源加载、客户端交互和即时视觉反馈；FastAPI 是会话、合法动作、关卡进度、评分与结果的唯一权威。Next.js 不重复实现另一套业务评分 API。

建议 George 对外提供同源入口：网页路由到 Next.js，/api/v1 路由到 FastAPI。若采用分域部署，需在交接时确定明确的 CORS 白名单和凭据策略。

Next.js 页面壳与静态内容可使用 Server Components；交互舞台、拖动、音频和横屏提示属于 Client Components。依据：[Next.js 组件边界](https://nextjs.org/docs/app/getting-started/server-and-client-components)。FastAPI 按业务域组织路由和服务，依据：[FastAPI 多文件结构](https://fastapi.tiangolo.com/tutorial/bigger-applications/)。

## 3. 推荐仓库结构（待开发，不表示这些应用已存在）

~~~
apps/
  web/
    src/app/                         # 入口、游戏、结果、错误页面
    src/features/game/               # 会话、动作分发、状态同步
    src/features/levels/l1...l4/      # 四关独立交互实现
    src/features/results/            # 16 型结果展示
    src/components/                  # 对话框、按钮、物品栏、方向提示
    src/lib/api/                     # 从 OpenAPI 生成的 TS 类型与客户端
    src/styles/                      # 设计变量、全局规则
    public/game/                     # 版本化图片、字体、音效
  api/
    app/main.py
    app/api/v1/                      # HTTP 路由，不直接堆叠业务
    app/domain/game/                 # 关卡状态及动作校验
    app/domain/scoring/              # 无数据库依赖的确定性评分函数
    app/services/                    # 事务、会话、发布与重算
    app/models/                      # 数据库模型
    app/schemas/                     # Pydantic 请求与响应
    app/repositories/
    migrations/
    tests/
content/
  manifests/                         # 关卡、场景、选项、资产、跳转
  scoring/                           # 私有评分版本，不进入前端 public
  personas/                          # 16 型名称、解释和文案版本
docs/
  README.md                          # 文档索引
  architecture.md
  scoring-design.md
  development-plan.md
  requirements-register.md
  save-and-resume.md
  pr-review-and-uat.md                # PR 审查、后台追踪与业务验收
  examples/scoring-policy.draft.json
  uat/                               # 后续验收摘要，未执行前不填通过记录
~~~

前后端契约由 FastAPI OpenAPI 生成，避免手写两个不同的事件类型表。内容定义只支持声明式条件与有限操作，不允许配置文件执行任意 Python/JavaScript。

## 4. 前端页面与游戏状态

建议路由：

| 路由 | 职责 |
| --- | --- |
| / | 游戏介绍、开始、继续上次游戏 |
| /play/[sessionId] | 单一游戏壳，内部切换关卡和镜头，避免场景间整页刷新 |
| /result/[resultId] | 本人结果、四关回顾、重新开始 |
| /help | 操作、音频、横屏说明，可作为弹窗复用 |

首次进入：开始 → 音频启用/静音选择 → 创建会话 → 资源就绪 → L1。音频需用户操作后启用，关闭音频不影响通关。

~~~mermaid
stateDiagram-v2
    [*] --> Intro
    Intro --> Loading: 开始或继续
    Loading --> L1
    L1 --> L2: 过河并完成对岸阶段
    L2 --> L3: 四组均完成或明确拒绝且通行条件满足
    L3 --> L4: 风暴阶段结束且物品选择完成
    L4 --> Finalizing: 确认出口
    Finalizing --> Result: 服务端成功结算
    Finalizing --> Finalizing: 失败重试，保持同一结算请求
    Result --> Intro: 新建会话重新玩
~~~

每个场景再包含加载、探索、物件查看、选择确认、动作提交、动画播放、过场、错误恢复等子状态。家具拖动中的位置与提示气泡只是本地 UI 状态；确认后的摆放、物品归属和场景推进必须由后端确认。服务器不能仅凭客户端声称“关卡完成”解锁下一关。

用户已确认：断网、关闭页面或主动退出后可继续原场景。采用服务端权威检查点、服务端场景草稿和 IndexedDB 本地 outbox/草稿；每个关键动作及时保存，不依赖关闭事件。家具未确认布局也按草稿保存，恢复不提前计分；突然强杀仅能恢复已落盘状态。重玩建立新会话，不覆盖旧结果。完整流程、接口与验收见 [场景保存与恢复](save-and-resume.md)。

## 5. 四关交互建模

| 关卡 | 实际内容 | 工程重点 |
| --- | --- | --- |
| L1 分离之河 | 修桥、游泳、泳圈、船；对岸人物和灯 | 船桨第 5 次计分、人物/灯动作顺序、所有符合条件的规则累加 |
| L2 失联房间 | 座位与钥匙、半开门、耳环、家具摆放 | 每局四组、首把钥匙必失败、严格 >15 秒长寻找、Figma 摆放 action |
| L3 风暴大厅 | 门、等待、右窗帘、左窗、风扇；出口物品 | 风暴拒绝路径待设计、只携带一件、“是”与物品分值累加 |
| L4 远方之门 | 微光门、静塔门、森林门、宫殿门 | 视觉以最终 UI 为准，出口互斥、最终确认与幂等结算 |

PDF 的 L1 实际顺序是 L1-01 过河、L1-02 对岸人物与灯；首页增补文字的编号不一致，以详细表格的场景和内容建立 stable ID，并保留来源编号。

L2 固定提供 L2-01/02/03/04 四组，无随机抽取。用户最新指示优先于 PDF 中“每次 2–3 组/每场景最多 3 个主要操作”的旧限制。通过镜头和子区域逐个呈现任务，避免把所有提示一起堆在场景上。

L2 每局提供四组已确定；拒绝钥匙或半开门后如何访问后续任务、是否允许回访/跳过、如何通关，等待设计师讨论。此前独立主线出口等仅为工程建议，当前不作为实现默认值。依赖这些分支的状态迁移先标记待设计，不额外生成跳过 action 或分值。

L3 不开/不关门时风暴是否触发、如何结束，同样等待设计师决定；不自行用计时器或强制开关门补齐剧情。开发可推进已明确的 action、计分、存档和 UI，但不能声称未定分支已完成。

PDF 中明确的“不”“先否后是”等都需要可操作分支；“没点击”“未看到”“断线”不能自动成为拒绝。计分所需的否定行为用中性确认或场景结束选择收集，避免把网页变成问卷。

## 6. 响应式场景，不使用固定页面坐标

将两个问题分开：

1. 页面 UI：CSS Grid / Flex、minmax、clamp、容器查询、动态视口高度与 safe-area。顶部工具区、中央舞台、底部叙事/操作区、物品栏分别占布局轨道。不使用 position:absolute/fixed 或固定 top/left 拼页面。
2. 场景空间：门、窗和家具需保持相对背景的空间关系。推荐可缩放 SVG viewBox 承载背景、场景物件和命中区域；坐标是场景内部逻辑坐标，不是浏览器屏幕像素。整个舞台保持比例，等比缩放并完整显示关键物件。SVG 背景仍使用原始导出的图片资产，不把 Figma 整屏截图直接当成可交互实现。

viewBox 的逻辑坐标依据：[MDN SVG in HTML](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_in_HTML)。这项方案需要在第一个场景原型中验证：背景与命中层同步缩放；不是把原始 1920px 页面缩小后让文字与按钮无法点按。

提示、说明和物品栏在舞台外采用 HTML 布局；小屏关键物件可放大查看或使用同步“可交互物件”面板。不要用很小的透明热区代替可访问操作。Figma 的物件构图保留，提示和工具栏可以响应式重排。

家具布局与操作按最终 Figma 实现，对应 action 在后端验证后计分，不新增自由布局自动分类或解释推断。若设计含拖动，保存归一化 x/y、角度和布局版本用于存档恢复，不保存客户端 CSS 像素。只在有效确认 action 时结算，不按 pointermove 计分。

手机竖屏：使用原生 dialog 顶层模态提示，正文严格为“为了保证用户体验请翻转手机为横屏”。旋转横屏自动关闭；返回竖屏再次显示，阻止舞台输入。使用 CSS orientation 联合可用宽高和触控能力判断，避免桌面窄窗被误认为手机；软键盘尺寸变化需单独测试。浏览器负责实际旋转，不强制依赖屏幕锁定 API，不用 CSS 将整个页面旋转 90°。

计时在方向提示、切后台、资源加载或断线时暂停；本地立即暂停，并与服务端有效活动区间同步，恢复时不能把停留后台计入“持续寻找”。详见评分文档。

触屏无 hover：首次轻触/键盘聚焦打开物件说明，明确按钮执行选择；桌面 hover 仅作辅助提示。选中效果不能只依赖颜色。风暴动画支持降低动态效果，不通过连续强闪烁表达压力。

## 7. 数据模型

| 表 | 核心字段与用途 |
| --- | --- |
| content_versions | 不可变场景、选项、资源 manifest、内容 hash |
| scoring_versions | 状态 draft/published/retired、schema、规则、权重、阈值、hash |
| game_sessions | 匿名凭据摘要、content/scoring/persona 版本、本局内容集合、状态、revision |
| level_runs | session + level 唯一、当前场景、完成状态、固定四组、物品和检查点 |
| scene_drafts | session/scene、base_revision、draft_revision、schema_version、未确认布局与查看位置；不计分 |
| action_events | client_action_id、服务端 sequence、action、payload、server_time、resulting_revision |
| score_contributions | 原始事件引用、rule_id、结算范围、A/V/T/F 增量、替代关系 |
| level_score_snapshots | 每关完成即保存：有效贡献、事件截止序号、四轴 raw/normalized 总分、coverage、权重与加权贡献、版本；独立只读 |
| result_snapshots | 引用四份关卡快照、各关加权贡献、最终四轴、边界规则、类型代码、结果文案快照 |
| persona_versions | 16 型映射与解释文案版本 |

本 MVP 不实现登录、注册或账号数据同步；最终汇总至 ZENEWE 平台数据库，由 George 在部署后负责迁移与整合。当前 PostgreSQL 方案是游戏数据层的工程建议，不代表已确定 ZENEWE 的数据库类型、表结构或迁移接口。平台身份与字段映射由 George 确定，本项目不自行假设或实现。

独立开发和测试阶段使用服务端生成的高熵匿名会话凭据；sessionId/resultId 不是访问授权。推荐设置 Max-Age/Expires 的持久 Secure、HttpOnly、SameSite Cookie 绑定访问权（有效期与存档保留期对齐），Cookie 写操作验证来源/CSRF。多人共用设备的切换、跨设备找回以后再设计。不要将心理画像放入普通访问日志或公共可枚举 URL。

原始行为追加保存；没有必要把整个系统做成复杂事件溯源框架。权威检查点和事件在一个数据库事务内落库。结果只能由合法终态产生。重复请求返回原成功结果，不能重复发放物品或累计分数。

数据保留期、删除入口和是否允许匿名校准统计需要产品负责人确定；文档不自行承诺永久保留。删除会话时联动清理其行为与结果，不误伤规则版本。

## 8. API 合约草案

| 接口 | 输入 / 输出 | 约束 |
| --- | --- | --- |
| POST /api/v1/sessions | 创建幂等键 → session、版本、固定内容、状态 | 服务端选择已发布规则 |
| GET /api/v1/sessions/resumable | 本人未完成存档摘要 | Cookie 授权，静态路由先于动态 ID 路由 |
| GET /api/v1/sessions/{id} | 权威检查点、revision、可用动作、兼容草稿 | 只允许本人 |
| PUT /api/v1/sessions/{id}/draft | base_revision、expected_draft_revision、草稿字段 | 白名单校验，不计分、不解锁 |
| POST /api/v1/sessions/{id}/actions | action_id、expected_revision、action、target、payload | 服务端校验合法性、权限、顺序，原子写入 |
| POST /api/v1/sessions/{id}/activity | 前后台/方向/可交互状态、活动序号 | 有效计时辅助，不直接计分 |
| POST /api/v1/sessions/{id}/finalize | 幂等键 → result_id | L1–L4 都达到允许完成条件 |
| GET /api/v1/results/{id} | 结果、类型文案、必要回顾 | 本人授权，按需返回维度 |
| GET /api/v1/uat/sessions/{id}/levels/{levelId}/actions | 分页 action 记录、规则、四轴净变化、前后累计与原因 | 仅授权测试人员，源于真实后端 |
| GET /api/v1/uat/sessions/{id}/levels/{levelId}/score | 本关 provisional 累计或 finalized 快照、归一依据和贡献 | 单关独立可查，不要求整局完成 |
| GET /api/v1/uat/sessions/{id}/settlement | 四份关卡快照、权重与最终四轴；未完成则返回状态 | 仅授权测试人员，不为未完成局生成正式结果 |
| GET /health/live | 进程存活 | 不查询外部服务 |
| GET /health/ready | DB 与有效配置是否就绪 | 不泄漏凭据 |

动作接口成功返回 accepted_event_id、revision、state、available_actions。相同 action_id + 相同内容重放返回原响应；相同 action_id 换内容拒绝；旧 expected_revision 返回 409 与恢复提示；非法场景动作返回明确业务错误。双标签页通过 revision 防止覆盖。

页面动画可即时表现“正在提交”，但物品获取和过场只在响应成功后成为事实。动作发送前先将完整请求和幂等键写入 IndexedDB outbox；断网时持久保留，关闭再开也可重试，禁用后续依赖动作并暂停计时。首版保证中断恢复，不承诺完整离线游玩。

## 9. 非功能目标与发布责任

代码以小功能 PR 交给 George review，业务验收需同时展示 UI 与真实后端处理。规则、追踪字段、权限要求及记录模板见 [PR 与 UAT 规则](pr-review-and-uat.md)。在评分/行为闭环阶段加入只读追踪记录，首个可玩功能开始演示，不等最终 UAT 才补后台可见性。追踪面板尚未实现。用户明确要求 action 明细 → 单关总分 → 四关加权结算三层独立可查；关卡完成立即保存评分快照，最终结果引用四份关卡快照，不能只保存整局打包结果。

- 单局任何合法选择都可到达结束或明确退出，不被强迫选择某一种“正确性格”。
- 页面载入先下载当前关卡，空闲时预取下一关；素材按场景拆分，不把四关所有大图放进入口包。
- 当前没有流量指标：并发规模与响应延迟 SLA 在 George 确认基础设施后再设，性能阶段记录实测值。
- CI 验证前端 lint/typecheck/build、后端测试、迁移与评分配置、关键浏览器流程。
- 开发方交付可启动应用、锁文件、示例环境变量、迁移、接口与操作文档；George 负责环境、HTTPS、反代、数据库、域名、发布与回滚。未获得测试环境之前，不将本地验证称为上线验收。
