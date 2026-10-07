# AWS EC2 部署与运维交接

更新：2026-10-07。适用本仓库 Next.js + FastAPI + PostgreSQL 17。本文和脚本是交付给部署同事的执行材料；不表示已经在 AWS 上部署或完成真实用户验收。

## 1. 部署完成后是什么样

```text
玩家浏览器 https://game.example.com
                  │ TCP 443（80 自动跳转 HTTPS）
            EC2：Caddy 反向代理 / 自动续证
                  │ web:3000
              Next.js 网页
                  │ /api/* 同源代理 → api:8000
              FastAPI 接口
                  │ db:5432
              PostgreSQL 17
                  └─ Docker 持久化卷 → EC2 EBS 磁盘

每次发布：环境/DNS 预检 → 构建 → Caddy 配置验证 → 数据库连接检查
        → 停止业务入口和写入 → 备份 → Alembic upgrade head
        → API 就绪 → Web 就绪 → 本机 TLS 与公网 HTTPS 检查
```

采用单台 EC2 + Docker Compose，适合首版和小规模试运行。不是高可用架构；EC2 或磁盘故障会影响全部服务。后续高可用可规划 RDS、独立应用节点与负载均衡，不包含在本脚本中。现有账号跨设备同步并未实现：匿名会话凭据在浏览器，数据库保存服务端进度；换域名、清浏览器数据或换设备不会自动找回原会话。

| 服务 | 技术 / 作用 | EC2 公网端口 | 数据是否持久化 |
| --- | --- | --- | --- |
| proxy | Caddy 2，TLS 证书与反向代理 | 80、443 | 证书保存在 caddy_data 卷 |
| web | Node 22 / Next.js，网页及同源 API 代理 | 不暴露 3000 | 代码在镜像中 |
| api | Python 3.12 / FastAPI，校验动作与评分 | 不暴露 8000 | 业务记录写入 PostgreSQL |
| migrate | Alembic，一次性建表 / 升级 | 无 | 当前迁移目标 0005_scoring |
| db | PostgreSQL 17 | 不暴露 5432 / 54329 | emotional-prod_postgres_data 卷 |

EC2 配置是独立文件，**不要把根目录开发用 compose.yaml 与生产配置合并，也不要在服务器直接执行裸 `docker compose up`**。统一使用本文 manage.sh；固定项目名 emotional-prod，避免误连开发环境或创建另一套空数据卷。

## 2. 部署前需要准备

由部署同事填写并保管：AWS 账号/区域、EC2 ID、Elastic IP、SSH 私钥、域名/DNS 权限、Git 仓库读取权限、发布 commit SHA、备份存储位置、维护与验收负责人。应用本身不需要 AWS Access Key，也不需要本机 Python、Node 或 Figma token。

建议起点（容量估算，未做负载测试）：Ubuntu Server **24.04 LTS，x86_64/amd64**，2 vCPU / 8 GiB RAM（例如 t3.large），加密 gp3 EBS 60 GiB 或更大。构建 Next.js 和存放游戏素材需要额外内存/磁盘；观察负载后再调整。费用按所选区域和实际 AWS 报价确认。

1. 在有 Internet Gateway 路由的公网子网创建 EC2，绑定 Elastic IP，启用 IMDSv2 和 EBS 加密。应用/数据库同机，建议关闭数据所在卷的随实例终止删除，并为磁盘配置快照计划。
2. 安全组入站：TCP 22 仅允许部署人员公网 IP（`x.x.x.x/32`）；TCP 80、443 允许目标用户访问（公开站点为 `0.0.0.0/0`）。若实际启用 IPv6，单独配 IPv6 规则。**不开放 3000、8000、5432、54329**。出站需支持 DNS、镜像/依赖下载和证书签发。
3. 域名 A 记录指向 Elastic IP。仅在配置好 IPv6 时保留 AAAA 记录，避免证书校验走到错误地址。首次部署先使用 DNS 直连；若加 CDN 代理，需另行验证回源与 TLS 配置。
4. 确认 80、443 没有被其他服务占用。本脚本不会修改安全组、创建 EC2、修改 DNS 或终止其他项目。

默认 Docker 数据目录在根 EBS 的 `/var/lib/docker`（可用 `sudo docker info --format '{{.DockerRootDir}}'` 查看），**并没有自动创建或挂载第二块数据盘**。若团队要求独立数据盘，应在首次启动数据库前完成挂载及 Docker data-root 配置，再运行本文步骤；已有数据库不可直接切换到空目录。Docker 发布端口不应只依赖 UFW 过滤，以 AWS 安全组控制公网入站，参见 [Docker 防火墙说明](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)。

安全组规则依据 [AWS EC2 官方说明](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html)。Caddy 自动签发/续期要求域名解析正确、80/443 可达并持久保存证书目录，参见 [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)。

## 3. 首次部署：复制执行

部署文件已放在 GitHub 的 `Eltondev` 分支。下面的 `YOUR_RELEASE_COMMIT_SHA` 必须替换为交接时指定的完整提交号（包含本次脚本修正版）；不要省略版本确认直接部署仓库默认分支。

本机终端连接 EC2（Windows PowerShell 同样可用）：

```bash
ssh -i YOUR_KEY.pem ubuntu@YOUR_ELASTIC_IP
```

macOS/Linux 如提示私钥权限过宽，先 `chmod 400 YOUR_KEY.pem`。Windows 使用当前用户可读、其他用户无权读取的私钥文件。SSH 超时先检查安全组 22 是否仍允许当前公网 IP。首次连接应核对 EC2 主机指纹。

之后命令全部在 **EC2 的 Bash 终端**运行：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone --branch Eltondev https://github.com/robber-857/Emotional-escape-room.git emotional
cd emotional
git checkout --detach YOUR_RELEASE_COMMIT_SHA

# 安装 Docker Engine / Compose 插件并设置开机启动，仅支持 Ubuntu 24.04
sudo bash deploy/ec2/bootstrap-ubuntu.sh

# 替换成真实域名；生成随机数据库密码，不会覆盖已有配置
sudo bash deploy/ec2/manage.sh init game.example.com

# 检查工具、Docker、配置和 DNS（仍须人工确认解析 IP 就是本 EC2）
sudo bash deploy/ec2/manage.sh check
getent ahostsv4 game.example.com
sudo ss -ltnp '( sport = :80 or sport = :443 )'
df -h . /var/lib/docker

# 构建、备份、迁移、启动、检查 HTTPS
sudo bash deploy/ec2/manage.sh deploy
sudo bash deploy/ec2/manage.sh status
```

私有仓库使用团队授权的只读 deploy key 或 Git 凭据管理器，不要把 token 写进克隆 URL 或部署文档。若使用 GitHub deploy key，先在仓库 Settings → Deploy keys 登记服务器公钥，再使用 SSH 地址 `git@github.com:robber-857/Emotional-escape-room.git` 克隆；`Permission denied (publickey)` / `Repository not found` 是读取权限问题，先解决再继续。不要把 SSH 私钥或 GitHub token 放进 `.env`。

安装脚本使用 [Docker 官方 Ubuntu 软件源](https://docs.docker.com/engine/install/ubuntu/)，遇到既有冲突包会停止，不会自动卸载。已有 Docker 时也会安装所需辅助工具并验证 Compose、Buildx 和 Docker daemon。无需把 ubuntu 用户加入拥有主机高权限的 docker 组，命令统一加 sudo。后续每次重新 SSH 登录，先 `cd ~/emotional` 再执行本文相对路径命令。

长时间构建建议在 tmux 中运行，避免 SSH 中断影响发布：`sudo apt-get install -y tmux`，然后 `tmux new -s emotional-deploy`；断线后重新 SSH 并 `tmux attach -t emotional-deploy` 查看。不要在两个终端同时执行发布，脚本会通过互斥锁拒绝第二次操作。

首次下载镜像、安装依赖、编译素材可能耗时较长。此生产脚本要求已有可解析的真实域名，不提供无域名公网 HTTP 部署模式。脚本成功后访问 `https://你的域名`。证书等待失败不一定表示应用故障，先检查第 8 节；不能通过关闭 TLS 校验来当作验收成功。

## 4. 环境变量与数据库

脚本只使用 `deploy/ec2/.env`，不读取根 `.env` 或本机 `apps/api/.env`。示例在 [环境模板](../deploy/ec2/.env.example)。实际文件权限 600，已被 Git 和 Docker 构建上下文排除；备份和发布记录也被排除。不要贴出 `docker inspect`、完整 `docker compose config` 或真实 `.env`，这些可能包含密码。

| 配置 | 来源 / 示例 | 说明 |
| --- | --- | --- |
| DOMAIN | init 参数，如 game.example.com | 不带 https://、端口或路径 |
| POSTGRES_USER | emotional | 初始化数据库用户，小写字母/数字/下划线 |
| POSTGRES_DB | emotional | 数据库名称，同上 |
| POSTGRES_PASSWORD | init 自动随机生成 64 位十六进制 | 脚本只接受至少 32 位字母数字，避免 URL 编码歧义 |
| RELEASE_ID | deploy 自动维护 | 提交短 SHA + UTC 时间，保留旧应用镜像供回退 |
| APP_ENV | Compose 固定 production | 环境标签；不等于启用了额外鉴权或安全功能 |
| DATABASE_URL | Compose 自动组成 | postgresql+psycopg://用户:密码@db:5432/库名 |
| API_BASE_URL | 现有 Web Dockerfile 中设置 | http://api:8000，Next 构建和运行都使用；无需 NEXT_PUBLIC 变量 |

`.env` 使用简单的 `KEY=value` 格式，不加引号、空格或行尾注释。不要更改项目名或卷名。数据库启动变量**仅在空数据目录时初始化**；改 `.env` 密码不会修改已有数据库角色密码。需要轮换时安排停机，由数据库负责人先同步修改角色密码，再修改配置并重建 API 容器。

首次是空数据库，Alembic 自动创建表，无需手工导入 SQL，也不复制开发者本机的数据。现有进度要搬迁时先导出、演练恢复，再切换。数据库默认初始化用户有较高权限；此方案保留现有应用配置，后续可将迁移角色与运行角色拆分。

数据库查看（不需要公网开放端口）：

```bash
sudo bash deploy/ec2/manage.sh compose exec db psql -U emotional -d emotional
# psql 内执行：
# SELECT version_num FROM alembic_version;
# \dt
# \q
```

## 5. 发布后的验收

```bash
sudo bash deploy/ec2/manage.sh status
curl -fsS https://你的域名/api/v1/ready
sudo bash deploy/ec2/manage.sh compose run --rm --no-deps migrate alembic current
```

当前 ready 应返回 `status: ok`、`persistence_ready: true`、`schema_version: 0005_scoring`、`scoring_engine_ready: true`。现有接口仍返回 `scoring_ready: false`，这是应用现状，不应通过篡改返回值宣告评分规则全部完成。`/api/v1/health` 仅是进程存活，不能证明数据库和迁移完成。

同事需要用桌面和手机浏览器实际完成：封面进入 → L1 动作 → 刷新后恢复 → 顺序进入 L2/L3/L4 → 查看最终结果；确认没有接口 502/503、静态资源缺失、会话丢失。评分尚未配置的项目可能返回 pending_configuration，应按 [计分指南](scoring-test-guide.md) 判断，不视为基础设施故障。不能只打开 `?preview=1` 预览模式就通过验收。

还应在安排好的测试窗口重启 EC2，确认 Docker 自动启动、服务恢复和原会话仍存在。`unless-stopped` 不会重新拉起被手动 stop 的容器，维护后要明确执行启动。匿名会话接口目前没有在本部署层增加注册限流；公开推广前需要团队安排防滥用、负载验证和依赖安全检查。

交接记录：域名、实例 ID/区域、部署 SHA、部署时间、ready 响应、浏览器验收人/结论、最近备份位置、恢复演练日期。密码通过团队安全渠道另交。

## 6. 后续更新和失败处理

更新有短暂停机。先保留当前发布号（`deploy/ec2/state/releases.log`，sudo 查看），再拉取明确版本：

```bash
git fetch origin
git checkout --detach NEW_RELEASE_COMMIT_SHA
sudo bash deploy/ec2/manage.sh deploy
```

deploy 拒绝脏工作区或 Git 状态读取失败；不自动拉取或切换代码。它先预检并构建新镜像，验证 Caddy 配置及数据库 TCP 密码连接，再停 proxy/web/api，备份数据库后执行迁移。API/Web 健康后，先强制连接本机 443 检查真实域名的 TLS 和 ready JSON，再检查公网域名及首页，避免仅根据其他主机的 HTTP 200 判断本机成功。`check` 的 DNS 检查只证明可解析，**解析 IP 是否属于本 EC2 仍需核对**。

备份失败不会继续迁移；迁移或健康检查失败不自动降级数据库，业务服务可能仍停着。数据库卷保留，应用镜像不清理，日志默认轮转到每容器约 30 MiB。部署过程中可以另开终端运行 status / logs 查看进度。当前 Compose `--wait` 检查服务运行/健康状态，参见 [Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/)。

失败先看日志：

```bash
sudo bash deploy/ec2/manage.sh logs api
sudo bash deploy/ec2/manage.sh logs web
sudo bash deploy/ec2/manage.sh logs proxy
```

迁移输出自动保存在 `deploy/ec2/state/migration-<发布号>.log`，发布尝试记录在 `state/attempts.log`，成功记录在 `state/releases.log`（用 sudo 查看）。构建错误仍需从执行终端/tmux 中查看。不要盲目反复部署或执行 Alembic downgrade。若数据库结构与上一版兼容，可在 `sudoedit deploy/ec2/.env` 中把 RELEASE_ID 设置为 releases.log 中上一条成功发布的 release（先 `sudo docker image ls emotional-api` 和 `sudo docker image ls emotional-web` 确认两个镜像均在），再执行：

```bash
sudo bash deploy/ec2/manage.sh compose up -d --no-deps --no-build --pull never --wait api
sudo bash deploy/ec2/manage.sh compose up -d --no-deps --no-build --pull never --wait web
sudo bash deploy/ec2/manage.sh compose up -d --no-deps proxy
curl -fsS https://你的域名/api/v1/ready
```

先确认该旧版本与当前 Compose 配置、数据库兼容；回退不要调用 deploy，它会再次构建当前检出代码并执行迁移。成功发布后 state/previous.env 保存上次配置（含密码）；首次发布前并无可回退版本。失败的新镜像保留，但 `.env` 发布号仅在全部检查成功后更新；不要用失败时的 `.env` 值推断实际正在运行的镜像，用 status / Docker 镜像信息核对。存在不兼容迁移时，需用备份恢复到新环境、验收后切流，恢复时间点之后的数据可能丢失，由业务负责人确认。

## 7. 备份与恢复演练

每次发布会在停止业务写入后自动备份。也可随时执行在线一致性备份：

```bash
sudo bash deploy/ec2/manage.sh backup
```

备份位于 `deploy/ec2/backups/*.dump`，格式 pg_dump custom archive，权限仅执行用户可读。脚本验证归档目录可读，**并不等同于恢复成功**。同机备份不能抵御 EC2/EBS 丢失：将备份复制到团队加密备份库或配置私有 S3 + EC2 IAM Role；启用生命周期/保留策略并实际验证取回。脚本不安装 AWS CLI、不创建 S3、不自动上传或删除历史备份。数据库、证书卷依赖 EBS，建议额外安排 EBS 快照。

可在 `sudo crontab -e` 中添加每日备份示例。先用 `timedatectl` 确认主机时区；以下仅在主机为 UTC 时表示每日 16:15 UTC，**不是固定悉尼本地时间**。同时确认实际仓库路径；锁冲突/磁盘满会失败，需要监控日志：

```cron
15 16 * * * /bin/bash /home/ubuntu/emotional/deploy/ec2/manage.sh backup >> /var/log/emotional-backup.log 2>&1
```

备份日志需要配置系统 logrotate，备份归档需要定期异地转存和人工/受控保留清理；未配置前不要认为已有完整自动备份方案。

推荐在**独立测试 EC2**用相同 PostgreSQL 17 和匹配的应用发布版本演练，初始化配置后执行下列步骤。以下假定数据库名/用户仍为 emotional，`/path/to/backup.dump` 换为已取回的文件：

```bash
# 独立测试机，先启动空数据库，不运行 deploy（它会自动迁移）
sudo bash deploy/ec2/manage.sh compose up -d --wait db
sudo bash deploy/ec2/manage.sh compose exec -T db \
  createdb -U emotional emotional_restore_check

# 文件必须能被当前 shell 读取；从 root-only 路径读取用 sudo cat 管道
set -o pipefail
sudo cat /path/to/backup.dump | sudo bash deploy/ec2/manage.sh compose exec -T db \
  pg_restore -U emotional -d emotional_restore_check --no-owner --no-privileges --exit-on-error
sudo bash deploy/ec2/manage.sh compose exec -T db \
  psql -U emotional -d emotional_restore_check -c 'SELECT version_num FROM alembic_version;'
```

随后在测试机 `.env` 将 POSTGRES_DB 改为 emotional_restore_check，再用匹配版本执行 deploy，检查表记录数量、ready 和真实游戏读写。再次演练使用新数据库名，避免覆盖已有测试数据。生产灾难恢复优先新 EC2/新卷恢复并验收，然后切 DNS；**上述命令不是原地覆盖生产库脚本**。

停止服务保留数据：`sudo bash deploy/ec2/manage.sh compose stop`。严禁把 `down -v` 或删除 Docker 卷作为重启/更新步骤。不要在未确认备份、镜像回退保留和其他项目依赖前执行 Docker prune。

## 8. 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| HTTPS 签发失败 | A/AAAA、安全组 80/443、域名 CAA 限制、proxy 日志；不要频繁删证书卷重试 |
| 外网连接超时 | EC2 状态、Elastic IP、公网子网路由、安全组、系统防火墙与端口占用 |
| 502 / 503 | status、api/web 日志和 ready；检查迁移是否成功，不只看 health |
| 密码认证失败 | .env 是否被修改、是否在旧数据卷上换密码；不会通过重建容器自动修正 |
| 构建被 Killed / exit 137 | 检查内存与 `sudo dmesg`，提高实例内存或改为 CI 构建，不盲目重复 |
| No space left | `df -h`、`sudo docker system df`，查看备份、镜像和日志；先转存再定向清理 |
| 更新后还是旧页面 | 检查本次 SHA、部署成功记录、实际容器镜像；只 restart 不会重新构建 |
| Another operation is running | 发布/备份互斥锁生效，等待现有命令完成，不要并行迁移 |
| bash 出现 $'\r' / bad interpreter | 通过 Linux git clone 拉取，.gitattributes 已指定脚本 LF，使用 bash 执行 |

## 9. 文件清单与验证范围

- [生产 Compose](../deploy/ec2/compose.yaml)：独立服务、内网数据库、持久化、重启、健康检查、日志轮转。
- [主机初始化](../deploy/ec2/bootstrap-ubuntu.sh)：安装 Docker Engine 和 Compose。
- [部署管理脚本](../deploy/ec2/manage.sh)：init / check / deploy / backup / status / logs / compose。
- [Caddy 配置](../deploy/ec2/Caddyfile)：统一 HTTPS 入口。

脚本需在真实 EC2 上完成首次执行、DNS/TLS、迁移、备份恢复、重启和用户流程验收，才可签署上线结论。后续迁移目标变化时，应同步检查应用 ready 的版本断言及本文说明。

2026-10-07 复查验证记录：

| 验证层 | 实际结果 |
| --- | --- |
| 静态配置 | Compose 解析、仅 proxy 发布端口、Bash 语法通过 |
| 脚本流程测试 | 初始化不覆盖凭据、发布号写入、停写→备份→迁移顺序通过；备份、迁移、Git 读取、脏工作区、数据库认证、Caddy 配置、DNS、TLS、ready 校验、锁占用等 10 种失败路径均中止且不更新成功发布号；重复环境变量拒绝，部署锁占用时仍能查询状态和日志 |
| 真实 Docker 构建 | 本仓库 API/Web Dockerfile 构建成功，包含 Next.js 编译和 TypeScript 检查 |
| 真实独立 PostgreSQL 17 | 空库迁移到 0005_scoring，重复执行迁移成功 |
| 真实代理和接口 | Caddy → Next.js → FastAPI，HTTP 首页封面与 ready 正常；创建会话并写入一次 swim 动作成功 |
| 真实备份恢复 | pg_dump 自定义格式导出，pg_restore 恢复到另一数据库；迁移版本、1 条会话、1 条事件均匹配 |
| 容器重启 | 重启 db/api/web 后，原会话仍可认证读取，状态版本仍为 1 |

真实测试使用独立的 `emotional-ec2-audit-20261007` Compose 项目、独立数据卷和本机 18480 端口，完成后已删除这套临时容器和测试卷，未修改开发数据库。为避免申请真实证书，测试仅覆盖 Caddy HTTP 代理，**不代表 EC2 上的完整 deploy 命令、Ubuntu 初始化、DNS/公网 TLS、安全组、EC2 整机重启、完整 L1–L4 浏览器 UAT 已通过**。镜像构建使用了本机已有依赖缓存，首次无缓存下载仍取决于 EC2 网络。

脚本流程测试可运行 `bash deploy/ec2/test-manage.sh`；它替代 Docker、Git、curl、DNS 和 flock，不能用 mock 测试通过来证明真实证书或锁竞争已验证。
