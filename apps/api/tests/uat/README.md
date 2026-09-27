# L1 UAT 自动化执行与人工验收

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
