# George：四关代码与本地启动

2026-09-30。四关已有服务器动作校验与数据库存档，迁移目标 **0004_l4**；正式评分待配置。推荐完整 Docker 模式，不需要本机 Node/Python/Figma token。

## 获取代码与 Docker 启动

安装 Git，启动 Docker Desktop（Windows：WSL2 / Linux containers）。以下在 Git Bash 执行：

```bash
git clone --branch Eltondev https://github.com/robber-857/Emotional-escape-room.git
cd Emotional-escape-room
[ -f .env ] || cp .env.example .env
docker compose up -d db
docker compose build api migrate web
docker compose run --rm migrate
docker compose up -d api web
docker compose ps -a
```

`[ -f ... ] || cp ...` 表示仅在文件不存在时复制。迁移成功后再启动应用。db/api/web 应 healthy，一次性 migrate 的 Exited (0) 正常。

已有仓库：先 `git status` 保留自己的修改，再 `git switch Eltondev`、`git pull --ff-only`。`git log -1 --oneline` 记录本次检查的提交；pull 不会取得作者未提交文件或数据库。

默认网页 http://localhost:3000，API http://localhost:8000/docs，宿主数据库 127.0.0.1:54329。作者当前网页为 3100；George 可在根 .env 设置 WEB_PORT=3100，然后相应替换网址。

检查 http://localhost:3000/api/v1/ready：persistence_ready=true、schema_version=0004_l4。`/api/v1/health` 只证明进程活着。失败看 `docker compose logs --tail 100 api web migrate`。

| 配置 | Docker 模式 | 本机热更新模式 |
| --- | --- | --- |
| 数据库 | PostgreSQL 17；根 .env 的 POSTGRES_USER/PASSWORD/DB；postgres_data 卷持久化 | 连接同容器的宿主 DB_PORT，默认 54329 |
| 后端 | Python 3.12；compose 组装 DATABASE_URL，内部 db:5432 | apps/api/.env 的 DATABASE_URL，凭据/端口与根配置一致 |
| 前端 | Node 22 / Next.js；构建时 API_BASE_URL=http://api:8000 | apps/web/.env.local：API_BASE_URL=http://127.0.0.1:8000 |
| 端口 | 根 .env 的 WEB_PORT/API_PORT/DB_PORT，只绑定本机 | dev/uvicorn 命令指定 |

内部地址不随宿主端口变化；改 Next.js API 代理目标需重建 web。Docker 不读取 apps/api/.env、apps/web/.env.local。不要复制或提交作者密钥。已有数据库卷不会因修改 POSTGRES_PASSWORD 自动更改用户密码。

## 服务器记录与验收

从真实新旅程依次完成 L1→L2→L3→L4，查看开发记录与 Network actions 中的 action_id、accepted/code、版本，对账 events 历史。刷新继续应恢复；丢失响应后同 ID 重试只推进一次。独立预览不是后端证据。

默认数据库用户/库名，在根目录执行：

```bash
docker compose exec -T db psql -U emotional -d emotional < docs/event-evidence.sql
docker compose exec db psql -U emotional -d emotional
```

进入 psql 后：

```sql
SELECT session_id, action_id, request, result, received_at
FROM game_events WHERE session_id = '替换为旅程UUID'
ORDER BY received_at;
```

L2/L3/L4 换成 l2_events/l3_events/l4_events。自定义凭据时替换命令参数；不要分享会话 token。完整边界见 [事件与评分核对](event-scoring-audit-v6.2.md)。

## 热更新开发（可选）

安装 Node.js 22+、Python 3.12+。如已启动本项目容器应用，先 `docker compose stop api web`，保留 db；不要结束其他项目进程。

后端终端，从仓库根目录：

```bash
docker compose up -d db
cd apps/api
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
# 先确认 DATABASE_URL 与实际数据库凭据/宿主端口一致
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --env-file .env --reload --host 127.0.0.1 --port 8000
```

前端另开终端，从仓库根目录：

```bash
npm ci
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local
npm run dev --workspace @emotional/web -- --port 3000
```

macOS/Linux 用 python3、.venv/bin/python。浏览器保持同一 localhost 地址和端口，避免因存储隔离找不到继续旅程。

## 更新、备份与版本差异

更新：git pull --ff-only 后重跑构建、迁移、启动。停止用 `docker compose down`，不要加 -v（会删除数据库卷）。默认库备份：

```bash
docker compose exec db pg_dump -U emotional -d emotional -Fc -f /tmp/emotional.backup
docker compose cp db:/tmp/emotional.backup ./emotional.backup
```

备份不提交 Git；恢复选独立数据库并核对目标。认证失败核对已有卷凭据，不要删卷解决。

工程检查：根目录 npm run typecheck / npm test / npm run build；apps/api 下 `.venv/Scripts/python.exe -m pytest -q`。默认 SQLite 跳过 PostgreSQL 并发项；数据库测试使用独立测试库，见 [UAT 总表](uat-test-matrix.md)。不能代替 George 自己电脑的四关、续玩、断网重试验收。

本次审计远端基线为 `21b0dc0`，已有五次拿绳、绳子位置/尺寸与人物分开调整。本地另有未提交 L2 和结果页修改：远端 L2 家具判定通过才开出口，本地点击确认即开；本地布局 v5/回执校验 v6，当时远端为 v4/v4。以实际拉取提交为准，不要把差异当配置失败。首次数据库为空正常，仓库不附作者会话。
