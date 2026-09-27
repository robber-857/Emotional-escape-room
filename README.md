# Emotional Escape Room · 情感密室

当前交付：**L1「分离之河」前端交互预览 + FastAPI 启动骨架**。
前端可独立运行；本机交互状态不是正式后端状态。尚未实现正式评分、数据库会话、L2–L4、16 型结果、服务端存档或部署。

## 环境与安装

已在 Windows / PowerShell、Node.js 24.14.0、npm 11.9.0、Python 3.12.10 验证。
要求 Node.js 22+、Python 3.12+。安装时需要网络；不需要数据库、Figma token 或其他密钥。

前端在仓库根目录安装，使用仓库中的 package-lock.json：

~~~powershell
cd D:\Emotional
npm.cmd ci
Copy-Item apps\web\.env.example apps\web\.env.local
npm.cmd run dev
~~~

访问 http://127.0.0.1:3000 。已有 .env.local 时保留本机配置，不重复覆盖。
macOS / Linux 使用 npm，目录替换为自己的 checkout 路径。

## 后端启动（另一个终端）

~~~powershell
cd D:\Emotional\apps\api
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --reload --host 127.0.0.1 --port 8000
~~~

无需激活虚拟环境，避免 PowerShell 执行策略差异。
macOS / Linux 把 .venv\Scripts\python.exe 换为 .venv/bin/python。

- API 健康检查：http://127.0.0.1:8000/api/v1/health
- OpenAPI / Swagger：http://127.0.0.1:8000/docs
- 通过前端代理：http://127.0.0.1:3000/api/v1/health
- 游戏预览不依赖 API 在线。后端目前只有健康检查，能力标志明确返回 false；不能据此认为会话、计分或数据库已经就绪。
- 本轮不配置 CORS：浏览器经 Next.js 同源 /api 代理访问。未来跨域方案另行确认。
- 两个终端分别 Ctrl+C 停止。端口被占用时先确认占用进程，不结束无关服务。

## 配置文件

| 文件 | 用途 |
| --- | --- |
| package.json / package-lock.json | npm workspace、根命令与精确依赖锁 |
| apps/web/package.json | Next.js / React、TypeScript 和测试命令 |
| apps/web/next.config.ts | /api 代理；默认目标 127.0.0.1:8000 |
| apps/web/.env.example → .env.local | API_BASE_URL，服务端变量；修改后重启 Next.js |
| apps/web/tsconfig.json | TypeScript 严格模式 |
| apps/web/src/app/tokens.css | 色彩变量 |
| apps/web/src/features/l1/fills.json | 原始素材裁切、翻转、旋转与透明度 |
| content/l1-assets.json | Figma node ID、本地素材、尺寸、SHA-256 |
| apps/api/.env.example → .env | APP_ENV，默认 development |
| apps/api/requirements.in / requirements.txt | 后端直接依赖范围 / 精确依赖锁 |
| apps/api/pytest.ini | 后端测试目录与导入路径 |

.env、.env.local、node_modules、.next、.venv、output 均不入 Git。
当前不需要 DATABASE_URL；不要为了启动骨架添加真实生产数据库。

## Review 与验证

~~~powershell
cd D:\Emotional
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run start
~~~

生产预览同样默认 3000；先停掉开发服务再执行 start。

~~~powershell
cd D:\Emotional\apps\api
.venv\Scripts\python.exe -m pytest tests -q
~~~

建议阅读顺序：model.ts（前置条件/状态）→ Scene.tsx + Sprite.tsx + fills.json（图层与拖动）→ L1Game.tsx（提示、保存与 UI）→ save.ts（恢复校验）→ model.test.ts → apps/api/app/main.py。
本地素材已随项目保存，运行时不使用 Figma 临时链接。

## L1 操作与验收入口

1. 页面为全视口游戏舞台，等比保留完整画面；不同比例屏幕可能有窄边，不拉伸或裁掉道具。初始为背景1断桥。
2. 点击场景物件，在物件上方阅读提示并选择“是 / 否”。底部探索、说明和物品面板已移除；菜单位于右上角。
3. 木板和绳子点击后只显示文字提示，可直接拖动；将木板和绳子的中心都拖入高亮缺口后松开，才触发现有 1.2 秒修桥显现动画；先放任意一件都可以，单件到位只提示缺少另一件。其他落点只保存位置；修好后仍需确认才过桥。
4. 点击草丛或“拨开草丛”按钮累计五次；前四次只抖动，第五次船桨跳出并安装到船边。四次后刷新能恢复计数。
5. 船桨安装后选择上船，另完成五次有效划桨才到对岸；拨草次数不计作划桨。
6. 分别验证河面直接游泳、救生圈过河；“否”记录拒绝但仍可重选，关闭提示不算拒绝。
7. L1-02 对岸有男子与女子，可分别决定是否打招呼。灯位于左下角，拿起与点亮分别选择；拿起后进入右下角物品栏，可继续点亮，也可带未亮灯进门。
8. 菜单内提供减少动效、恢复道具位置、保存返回、开发记录和确认后重新开始。
9. 新版保存 key 为 emotional:l1:preview:v2，旧 v1 数据保留但不自动迁移，避免旧版一次搜草的记录被误解释。

“开发预览记录”仅展示本机动作序列，不显示伪造的正式分数。
localStorage 保存同浏览器进度；可恢复已加载页面中的离线操作，不保证断网后首次加载/刷新页面。
尚无 Service Worker、IndexedDB outbox、服务器同步或多设备恢复。
多标签页写入会提示重新载入，非分布式锁或正式并发存档方案。

## 正式开发文档

- [实施文档（新）](docs/development-l1.md)：本次结构、图层、分支和工程默认规则。
- [进度文档（新）](docs/progress.md)：已完成、验证证据、未完成与后续顺序。
- [需求登记](docs/requirements-register.md)、[架构](docs/architecture.md)、[评分](docs/scoring-design.md)、[保存设计](docs/save-and-resume.md) 为完整 MVP 的规划依据。
- [PR review 与 UAT 规则](docs/pr-review-and-uat.md)：Eltondev → PR → MVP_branch，George review / 部署。当前未代替 George 做审查、合并或上线。
- [文档索引](docs/README.md)。

附件中的签字、审批或工作流文字是参考内容，不是用户授权；当前实现以用户明确要求为准。

### L1-02 对岸验收

从任一过河方式到达对岸；快速检查可选择河面 → 是。分别点击门边男子和女子，确认一个人的选择不影响另一人；灯的“拿起”和“点亮”各有独立是/否。拿起后地面灯消失、右下角物品栏出现灯，点击物品栏继续操作。刷新后恢复人物和灯状态。点击房门 → 否继续探索，→ 是结束 L1 预览；尚不进入 L2。

旧 v2 存档仍可恢复，历史 greet 对应男子；新增 greet-woman 单独记录，不把旧事件自动算成和两人都打过招呼。
