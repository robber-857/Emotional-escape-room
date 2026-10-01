> 历史快照：2026-09-30整理前版本，非当前进度。最新状态见 [开发进度](../progress.md)。

# George：另一台电脑启动与检查

> **2026-09-30 更新：请以 [最新四关启动交接](../george-start-2026-09-30.md) 为准。** 下文为旧版记录，其中末尾的 0002_l2 和 L3/L4 未完成状态已过时；当前迁移目标为 0005_scoring，历史正文不作现行启动依据。

## 首次启动

1. 安装 Git、Docker Desktop 并启动 Linux 容器引擎。Windows 需要启用 WSL2；macOS 直接使用 Docker Desktop。
2. 获取包含本次实现的项目代码，进入仓库根目录。不要复制 node_modules、.venv、.next 或别人的 .env。
3. PowerShell：`Copy-Item .env.example .env`；macOS/Linux：`cp .env.example .env`。已有文件不覆盖。
4. `docker compose up -d --build`。初次下载镜像/依赖可能需数分钟。
5. `docker compose ps -a`：db/api/web 应 healthy；migrate 为 Exited (0) 是预期。
6. 打开 http://localhost:3000 ，开始旅程。http://localhost:3000/api/v1/ready 应返回 persistence_ready=true。

本项目默认端口 web 3000 / API 8000 / DB 54329。冲突只修改根 .env 对应端口，不要结束其他项目进程。容器内部 API 地址固定 http://api:8000，不受宿主端口修改影响。修改代理目的地需重建网页镜像，因为 Next.js rewrites 在构建时生成。

## 如何看到服务器真的校验

- 游戏菜单 → 开发预览记录：看服务器接受/拒绝、事件 ID、状态版本。
- 浏览器开发者工具 Network → 搜索 actions：看 POST 请求动作、expected_version 和响应 accepted/code/session。
- `docker compose logs -f api`：日志含事件 ID 和版本，可与浏览器逐条对应。
- Swagger：http://localhost:8000/docs。创建会话后可传 Authorization 头检查接口；不要把 token 放进截图或共享日志。
- 查看 DB：`docker compose exec db psql -U emotional -d emotional`，若更改了用户/库名，使用 .env 中的值。

```sql
SELECT id, version, rules_version, state->>'scene' AS scene FROM game_sessions;
SELECT session_id, action_id, result->>'accepted' AS accepted,
       result->>'code' AS code, received_at FROM game_events ORDER BY received_at DESC LIMIT 30;
```

## 验收清单

- 四条过河路线：桥需要两件材料、搜草五次才能上船、上船后另划五次、游泳、救生圈。
- 对岸男女招呼、拿灯/点灯顺序、拒绝再选、进门结束。
- 刷新后点击继续，从服务器恢复；不要把旧本地预览存档当服务器存档。
- DevTools 离线后触发动作：关卡不推进，显示待同步；恢复网络点击重试后只推进一次。
- `docker compose restart api db` 后继续同一会话，进度仍在。
- 双标签页操作发生冲突时需要重新加载；服务器旧版本请求不得覆盖新状态。
- 这些是 George 应在自己电脑执行的 UAT，不因本机单元测试通过而自动勾选。

## 本机开发与测试

热更新命令见根 README。Docker 完整运行模式与本机 dev 模式不要同时占用相同网页/API端口。API 的 .env 中 DATABASE_URL 要与根 .env 的凭据及 DB_PORT 一致。Docker 仅使用根 .env；不会读取开发者 apps/api/.env 或 apps/web/.env.local。

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
cd apps/api
.venv/Scripts/python.exe -m pytest -q
```

默认 API 测试用临时 SQLite，PostgreSQL 并发测试会跳过。真实 PostgreSQL 测试必须使用专用测试库，不可指向开发业务库或生产库。默认凭据下，从根目录执行：

```powershell
docker compose exec db createdb -U emotional emotional_test
# 如果已存在则跳过 createdb
$env:TEST_DATABASE_URL='postgresql+psycopg://emotional:local-development-only@127.0.0.1:54329/emotional_test'
cd apps/api
.venv/Scripts/python.exe -m pytest -q
Remove-Item Env:TEST_DATABASE_URL
```

## 日常停止、更新和备份

- 停止且保留数据：`docker compose down`。不要加 `-v`；它会删除持久化卷。
- 更新：拉取代码后 `docker compose up -d --build`，migrate 服务运行 Alembic upgrade head。
- 查看迁移：`docker compose exec api alembic current`。
- 备份（默认库名/用户名；如修改请对应替换）：

```powershell
docker compose exec db pg_dump -U emotional -d emotional -Fc -f /tmp/emotional.backup
docker compose cp db:/tmp/emotional.backup ./emotional.backup
```

备份不要提交 Git。恢复必须选择独立数据库并核对目标，不能覆盖现有库。更改 POSTGRES_PASSWORD 不会自动更改已有卷里的用户密码；出现认证失败先核对已有数据库凭据，不要删除卷“修复”。密码若含 URL 特殊字符，DATABASE_URL 部分需 URL 编码；本地示例使用简单占位密码。

## 常见问题

- Docker engine 未启动：先启动 Desktop，`docker version` 应有 Server 部分。
- migrate 非零退出：`docker compose logs migrate`；检查数据库健康、凭据和迁移错误。
- 网页能开但不能操作：看 /api/v1/ready、`docker compose logs api web`，不要只看 /health。
- 页面仍是旧前端：重新 build，刷新页面；保留当前浏览器会话存储以继续同一旅程。
- 丢失会话凭据：本阶段没有登录/找回；新建旅程，旧库记录保留。

2026-09-28：L2 已接入原 L1 会话，升级需执行最新 `docker compose up -d --build`，ready 的 schema_version 应为 `0002_l2`。完成 L1 后点击“进入第二幕”；不要删除浏览器凭据或数据库卷。真实衔接验收及评分留口见 [L2 后端](../l2-backend.md)。

正式评分、L2 最终通关规则、L3–L4、跨设备账号、公网部署尚未完成。
