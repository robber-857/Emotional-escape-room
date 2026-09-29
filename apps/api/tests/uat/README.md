# L1 UAT 自动化执行与人工验收

L2 的独立可执行验收入口已放到相邻目录 [uat2](../uat2/README.md)：Windows 双击 `../uat2/run.cmd`，或运行 `powershell -ExecutionPolicy Bypass -File apps/api/tests/uat2/run.ps1`。包含 L2 后端用例、L1→L2 真实浏览器流程和服务器记录逐条对账；本目录旧脚本保留兼容。

本目录为真实浏览器到 FastAPI/PostgreSQL 的可重复验收脚本，不用假的 API 成功响应，也不改写客户端游戏状态。仅使用本地或明确授权的测试环境；每次执行创建新测试会话，记录留在数据库中，不清理已有玩家数据。

## Windows / PowerShell（从仓库根目录）

先运行 `docker compose up -d --build`。需要 Node.js 22+ / npm、可用的 Chrome，以及下载 Playwright CLI 的网络连接。Docker 内运行应用不需要宿主 Node，但运行这些浏览器脚本需要。

```powershell
powershell -ExecutionPolicy Bypass -File apps/api/tests/uat/run.ps1 -BaseUrl http://127.0.0.1:3000
```

本机网页若配置为 3100，则把参数改成 `http://127.0.0.1:3100`。BaseUrl 必须是网页入口；API 使用网页的同源代理。API 默认 8000。

PowerShell 7 同样支持 macOS/Linux，可用 pwsh -File；也可手动用 `npx --yes --package @playwright/cli playwright-cli` 打开网页，再 `run-code --filename apps/api/tests/uat/<case>.js`。

## 场景

| 文件 | 验收范围 |
| --- | --- |
| swim.js | 游泳、拒绝再选、男女独立招呼、先拿灯后点亮、保存返回后恢复、结束 |
| ring.js | 救生圈、先点地面灯后拿起、结束 |
| boat.js | 无桨提示、拨草五次、刷新恢复、上船后另划五次、丢失真实成功响应再重试去重、结束 |
| bridge.js | 鼠标拖拽、单件材料不能修桥、刷新恢复摆放、两材料修桥、拒绝后过桥、结束 |
| mobile.js | Chromium 触控模拟：竖屏提示、横屏可操作与过河；不代表真机通过 |

每个场景有独立新会话；每次动作等待真实服务器响应并检查结果，关键页面变化读取新快照。失败时统一入口会以非零退出码停止；CLI 即使返回退出码 0，但含 `### Error` 或缺少 PASS 结果也判失败。

截图与日志保存到根目录 output/playwright/uat，不提交 Git。成功结果包含可对照数据库的 session_id、version，不输出会话 token。boat 中主动丢弃响应会产生预期网络错误。

## API 规则与并发验收

父目录 test_l1_api.py 检查非法跳步、错误凭据、材料位置、重复 ID、改载荷、旧版本冲突及完成后拒绝。临时 SQLite 测试默认跳过 PostgreSQL 并发用例；完整测试请使用以 `_test` 结尾的专用 PostgreSQL 数据库：

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg://emotional:local-development-only@127.0.0.1:54329/emotional_test'
cd apps/api
.venv/Scripts/python.exe -m pytest -q
Remove-Item Env:TEST_DATABASE_URL
```

库需提前创建；凭据按本机配置调整，不使用业务库。完整启动说明见 docs/george-local-setup.md。

## 人工验收边界

自动化实际执行结果见 [2026-09-28 执行记录](RESULTS-2026-09-28.md)。George 的审查、项目负责人对剧情/交互的签认、真实手机 Safari/Chrome 测试需另行记录，不代签。正式评分尚未实现，其 UAT 标为 Blocked，不把当前状态版本当分数。

## L2-01 前端预览验证

2026-09-28 后端接入后，默认 `/l2` 使用真实服务器并要求完成 L1；以下原七个前端脚本已明确进入 `/l2?preview=1`。真实衔接与恢复单独执行：

```powershell
powershell -ExecutionPolicy Bypass -File apps/api/tests/uat/run-l2.ps1 -BaseUrl http://127.0.0.1:3100 -Cases l2-server
```

`l2-server.js` 在独立桌面/触屏上下文中通过 UI 完成 L1 并进入同会话 L2，覆盖钥匙、耳环刷新、家具、活动时长暂停、断网、多标签和丢弃已提交响应后刷新重试。使用真实 API/PostgreSQL，不伪造成功回执；创建的测试会话保留在本地库中，不清理已有玩家数据。正式计分和真机验收不在通过范围内。

完整 L2 回归入口（七个脚本，独立浏览器上下文，不要求 L2 API）：

```powershell
powershell -ExecutionPolicy Bypass -File apps/api/tests/uat/run-l2.ps1 -BaseUrl http://127.0.0.1:3100
```

覆盖 L2-01、触屏、门锁、L2-02、L2-03、L2-04，以及 `l2-storage.js` 的满额/损坏存档、重置取消/确认、多标签冲突和写入失败。存档边界脚本明确注入隔离的本机测试数据并模拟拒绝写入，仅用于异常路径测试，不是实际玩家行为或后端 UAT 证据。每次日志保存在独立的 `output/playwright/uat/l2-uat-*` 目录；失败以非零退出码停止，运行结束关闭自己的浏览器会话。此入口不运行 L1 的服务端验收。

只复跑某一脚本可加 `-Cases l2-storage`（或其他脚本名，不带 `.js`）。

2026-09-28：桌面及触屏模拟两组通过，具体范围见 docs/progress.md 的 L2-01 记录。这不代表 L2 服务器校验或真机 UAT。

在仓库根目录运行（Web 默认 3000，本机当前覆盖为 3100）：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=l2-preview open http://127.0.0.1:3100/l2
npx --yes --package @playwright/cli playwright-cli -s=l2-preview run-code --filename apps/api/tests/uat/l2-01.js
npx --yes --package @playwright/cli playwright-cli -s=l2-preview run-code --filename apps/api/tests/uat/l2-01-mobile.js
```

脚本在独立浏览器上下文中验证，不修改现有玩家存档。截图保存到 output/playwright，运行前可用 `New-Item -ItemType Directory -Force output/playwright` 创建目录。

L2 最新坐下视角与门锁规则验证：`npx --yes --package @playwright/cli playwright-cli -s=l2-preview run-code --filename apps/api/tests/uat/l2-door.js`。2026-09-28 桌面和触屏模拟各覆盖先拿一把/先拿两把，共四组通过；同一把不能二试，另一把二试成功。

L2-02 半开门、拒绝后再进入、卧室刷新恢复与返回大厅：
```powershell
npx --yes --package @playwright/cli playwright-cli -s=l2-preview run-code --filename apps/api/tests/uat/l2-02.js
```

L2-03 耳环寻找与计时暂停：
```powershell
npx --yes --package @playwright/cli playwright-cli -s=l2-preview run-code --filename apps/api/tests/uat/l2-03.js
```
桌面用真实等待验证 >15 秒；覆盖拒绝后重选、返回后新段、菜单/离线暂停、手机旋屏暂停、刷新与只拾取一次。精确14999/15000/15001边界见前端 search.test.ts。浏览器模拟不等于真机或后端计时验收。

L2-04 家具鼠标/原生触摸模拟拖动、重叠/墙面拒绝、桌椅组合、撤销/恢复/刷新、键盘、确认与移动后坐下入口：
```powershell
npx --yes --package @playwright/cli playwright-cli -s=l2-preview run-code --filename apps/api/tests/uat/l2-04.js
```
