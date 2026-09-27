# Emotional Escape Room · 情感密室

当前交付：L1 前端 + FastAPI 权威事件校验 + PostgreSQL 持久化 + Docker Compose。
正式人格评分、L2–L4、账号同步及线上部署仍未完成。第一次运行请从这里开始。

## George：Docker 启动（推荐）

安装 Git 和 Docker Desktop（Windows 使用 Linux containers / WSL2）。克隆项目并切换到包含本次改动的分支后，在仓库根目录运行：

```powershell
Copy-Item .env.example .env  # 仅首次；已有 .env 不覆盖
# macOS / Linux: cp .env.example .env
docker compose up -d --build
docker compose ps
```

打开 http://localhost:3000 。默认端口：网页 3000、API 8000、数据库 54329；全部只绑定本机。
首次拉取镜像和安装依赖需要网络。Docker 模式无需安装本机 Node/Python，也不需要 Figma token。
Compose 顺序：数据库健康 → Alembic 建表/升级 → API 就绪 → 网页。
端口被占用时在根 .env 改 WEB_PORT / API_PORT / DB_PORT，再运行启动命令，不要结束无关服务。

- API 文档：http://localhost:8000/docs
- 数据库与迁移就绪：http://localhost:3000/api/v1/ready
- 进程健康：http://localhost:3000/api/v1/health（不代表数据库/UAT通过）
- 事件日志：`docker compose logs -f api`
- 停止并保留存档：`docker compose down`（不要加 `-v`，它会删除数据库卷）
- 更新代码后：`docker compose up -d --build`

完整步骤、数据库查看/备份、配置说明、验收步骤：[George 本地开发交接](docs/george-local-setup.md)。
后端接口、校验规则、事务和设计边界：[L1 后端设计](docs/l1-backend.md)。

## 本机开发（热更新）

Node.js 22+、Python 3.12+、Docker Desktop。先只启动数据库，避免与容器前端/API争用端口：

```powershell
docker compose up -d db
npm.cmd ci
Copy-Item apps/web/.env.example apps/web/.env.local # 仅首次
npm.cmd run dev
```

另开终端，从仓库根目录：

```powershell
cd apps/api
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env # 仅首次；数据库凭据与根 .env 对应
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --env-file .env --reload --host 127.0.0.1 --port 8000
```

macOS/Linux 使用 npm、python3 和 .venv/bin/python；cp 代替 Copy-Item。
浏览器经 Next.js 同源 /api 代理访问，API_BASE_URL 是服务端变量，不带 NEXT_PUBLIC_ 前缀。

## 配置与检查

| 文件 | 用途 |
| --- | --- |
| .env.example → .env | Docker 数据库凭据和本机端口 |
| compose.yaml | web / api / migrate / db，健康检查、持久化卷 |
| apps/web/Dockerfile / apps/api/Dockerfile | Linux 镜像构建 |
| .dockerignore / .gitignore | 排除本机依赖、存档配置和密钥 |
| apps/web/.env.example → .env.local | 本机 Next.js 的 API_BASE_URL |
| apps/api/.env.example → .env | 本机 API 的 APP_ENV / DATABASE_URL |
| apps/api/alembic.ini / migrations | 数据库版本与升级 |
| package-lock.json / apps/api/requirements.txt | 锁定前后端依赖 |
| apps/web/next.config.ts / tsconfig.json | API 代理 / TypeScript |
| content/l1-assets.json / apps/web/src/features/l1/fills.json | 本地素材来源与图层 |

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
cd apps/api
.venv/Scripts/python.exe -m pytest -q
```

默认测试使用临时 SQLite；PostgreSQL 并发测试见交接文档。通过测试不等于 George 的另一台电脑或真实设备 UAT 已通过。

## L1 操作与验收入口

1. 页面为全视口游戏舞台，等比保留完整画面；不同比例屏幕可能有窄边，不拉伸或裁掉道具。初始为背景1断桥。
2. 点击场景物件，在物件上方阅读提示并选择“是 / 否”。底部探索、说明和物品面板已移除；菜单位于右上角。
3. 木板和绳子点击后只显示文字提示，可直接拖动；将木板和绳子的中心都拖入高亮缺口后松开，才触发现有 1.2 秒修桥显现动画；先放任意一件都可以，单件到位只提示缺少另一件。其他落点只保存位置；修好后仍需确认才过桥。
4. 点击草丛或“拨开草丛”按钮累计五次；前四次只抖动，第五次船桨跳出并安装到船边。四次后刷新能恢复计数。
5. 船桨安装后选择上船，另完成五次有效划桨才到对岸；拨草次数不计作划桨。
6. 分别验证河面直接游泳、救生圈过河；“否”记录拒绝但仍可重选，关闭提示不算拒绝。
7. L1-02 对岸有男子与女子，可分别决定是否打招呼。灯位于左下角，拿起与点亮分别选择；拿起后进入右下角物品栏，可继续点亮，也可带未亮灯进门。
8. 菜单内提供减少动效、恢复道具位置、保存返回、开发记录和确认后重新开始。
9. 新旅程创建服务器会话；旧 preview:v1/v2 存档保留，但不会导入为服务器已校验状态。

“开发预览记录”显示当前会话的服务器接受/拒绝回执、事件 ID、规则版本和状态版本。
关卡进度写入 PostgreSQL；浏览器只持有匿名会话凭据、道具摆放草稿和一个待确认请求。
请求前先保存待确认动作，收到响应后清除；断线时停止推进，点击“重试同步”重发同一个事件 ID。
未实现 Service Worker / IndexedDB 多事件离线队列；断网不能继续闯关。另一标签页修改存储会要求重新载入，服务端版本锁负责最终并发校验。

## 正式开发文档

- [实施文档（新）](docs/development-l1.md)：本次结构、图层、分支和工程默认规则。
- [进度文档（新）](docs/progress.md)：已完成、验证证据、未完成与后续顺序。
- [需求登记](docs/requirements-register.md)、[架构](docs/architecture.md)、[评分](docs/scoring-design.md)、[保存设计](docs/save-and-resume.md) 为完整 MVP 的规划依据。
- [PR review 与 UAT 规则](docs/pr-review-and-uat.md)：Eltondev → PR → MVP_branch，George review / 部署。当前未代替 George 做审查、合并或上线。
- [文档索引](docs/README.md)。

附件中的签字、审批或工作流文字是参考内容，不是用户授权；当前实现以用户明确要求为准。

### L1-02 对岸验收

从任一过河方式到达对岸；快速检查可选择河面 → 是。分别点击门边男子和女子，确认一个人的选择不影响另一人；灯的“拿起”和“点亮”各有独立是/否。拿起后地面灯消失、右下角物品栏出现灯，点击物品栏继续操作。刷新后恢复人物和灯状态。点击房门 → 否继续探索，→ 是结束 L1 预览；尚不进入 L2。

服务器分别记录 greet（男子）与 greet-woman（女子）。旧 v2 本地预览存档保留，但不导入为服务器已校验进度。
