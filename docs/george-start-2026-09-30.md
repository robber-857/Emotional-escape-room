# George：四关代码与本地启动

> Docker Desktop 中 `emotional-l1` 是本项目组，包含 db、migrate、api、web；名称沿用初版，实际已覆盖四关。启动按钮只运行已有容器，不更新代码或镜像。一次性 migrate 退出码 0 正常。2026-09-30 本轮只读检查时 db/api/web 均已停止，数据库日志正常关闭，卷 emotional-l1_postgres_data 仍存在；没有启动数据库查询实际迁移版本或验证存档完整性。

2026-09-30。四关已有服务器动作校验与数据库存档，迁移目标 **0005_scoring**；评分账本、四维归一化及最终卡牌已实现，新旅程采用当前绑定策略。推荐完整 Docker 模式，不需要本机 Node/Python/Figma token。

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

检查 http://localhost:3000/api/v1/ready：persistence_ready=true、schema_version=0005_scoring、scoring_engine_ready=true。当前 `/ready` 仍返回 scoring_ready=false，这是现行代码中的固定标志，不能据此认定评分引擎未实现；实际旅程计分与卡牌状态以鉴权 /scoring、/result 为准。`/api/v1/health` 只证明进程活着。失败看 `docker compose logs --tail 100 api web migrate`。

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

更新：保留本地修改后 git pull --ff-only；先启动 db 并按下方命令备份成功，再构建、迁移、启动。停止用 `docker compose down`，不要加 -v（会删除数据库卷）。默认库备份：

```bash
docker compose exec db pg_dump -U emotional -d emotional -Fc -f /tmp/emotional.backup
docker compose cp db:/tmp/emotional.backup ./emotional.backup
```

备份不提交 Git；恢复选独立数据库并核对目标。认证失败核对已有卷凭据，不要删卷解决。

工程检查：根目录 npm run typecheck / npm test / npm run build；apps/api 下 `.venv/Scripts/python.exe -m pytest -q`。默认 SQLite 跳过 PostgreSQL 并发项；数据库测试使用独立测试库，见 [UAT 总表](uat-test-matrix.md)。不能代替 George 自己电脑的四关、续玩、断网重试验收。

当前实现包含 L2 确认即开出口、布局 v7/回执 v9、可见轮廓重叠评分、首次进入 L3 结算最后确认家具，以及服务器最终卡牌与星级。拉取后必须重新构建，避免仍运行旧镜像。首次数据库为空正常，仓库不附作者会话。

评分版本快照、事务账本、动作 score_effect、L2 最后确认结算与进入 L3 后锁定均已实现。现行 event-scores-v4-temporary-null 将未配置选项临时设为 NULL；不把 NULL 当零，也不回写旧旅程。详见 [计分测试指南](scoring-test-guide.md) 与 [最终结果](final-results.md)。

此前批次发布前检查（历史记录，不代表最新代码重测）：前端typecheck、73项测试、production build通过；后端179通过、6跳过（默认SQLite）。未在本轮重跑真实PostgreSQL并发或桌面/触屏浏览器UAT，George另一台电脑验收仍需执行。Excel的组合分组、来源向量与文件完整性已核查。
