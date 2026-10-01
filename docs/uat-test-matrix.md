# UAT 测试速查

在 `D:\Emotional` 的 PowerShell 运行。以下命令使用本机网页端口 **3100**；其他机器请替换为实际 Web 地址。服务未启动时先运行 `docker compose -p emotional-l1 up -d --build`，不要删除数据库卷。

## 测试表

| 套件 | 自动检查重点 | 执行入口 | 测试产物 |
| --- | --- | --- | --- |
| UAT1 / L1 | 游泳、救生圈、船、桥四条路线；人物/灯、材料、恢复与模拟手机操作 | `apps/api/tests/uat/run.ps1` | `output/playwright/uat/` 日志和截图，重复运行可能覆盖 |
| UAT2 / L2 | API 规则；真实 L1→L2 原会话；钥匙、卧室、耳环、家具；刷新、断网、响应丢失、冲突、服务器记录对账 | `apps/api/tests/uat2/run.ps1` | `output/playwright/uat2/<run-id>/report.json`；截图见 UAT2 README |
| UAT3 / L3 | API/迁移；L2→L3 原会话；六项回答、television、九选一/不带；最终确认额度、恢复、重试、冲突；逐事件服务器来源/校验依据与完整回执对账 | `apps/api/tests/uat3/run.cmd` | `output/playwright/uat3/<run-id>/report.json`、日志、JUnit、截图 |
| UAT4 / L4 | API/迁移；L3 两种离场、四门确认、终态锁定；离线/响应丢失/跨页同步；服务器回执对账、预览隔离 | `apps/api/tests/uat4/run.cmd` | `output/playwright/uat4/<run-id>/report.json`、日志、JUnit、截图 |
| L2 本地预览回归 | 七组本地交互/存储检查，含钥匙、门、耳环、家具、异常存储；不作为服务器验收证据 | `apps/api/tests/uat/run-l2.ps1` | `output/playwright/uat/l2-uat-<id>/` |

## 可复制命令

```powershell
cd D:\Emotional

# UAT1：浏览器验收，不自动运行后端 pytest
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/tests/uat/run.ps1 -BaseUrl http://127.0.0.1:3100

# UAT2：后端 + 浏览器
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/tests/uat2/run.ps1 -BaseUrl http://127.0.0.1:3100

# UAT3：后端 + 迁移 + 浏览器
.\apps\api\tests\uat3\run.cmd -BaseUrl http://127.0.0.1:3100

# UAT4：旧入口仅接受 0004_l4，当前 0005_scoring 会被拦截，修复兼容性后再使用
.\apps\api\tests\uat4\run.cmd -BaseUrl http://127.0.0.1:3100

# 可选：仅 L2 本地预览回归
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/tests/uat/run-l2.ps1 -BaseUrl http://127.0.0.1:3100
```

需要 Node/npm、Chrome；UAT2/UAT3/UAT4 还需要已安装依赖的 `apps/api/.venv`。现行服务要求 schema `0005_scoring`。UAT2 已接受该版本；UAT3 旧脚本只接受 `0003_l3`/`0004_l4`，UAT4 只接受 `0004_l4`，会在 readiness 检查拒绝现行服务，须先更新脚本及行为断言再验收，不能为运行旧测试而降级数据库。浏览器会在目标服务新增独立测试旅程并保留记录，不操作现有玩家会话。建议逐套运行。

## PostgreSQL 并发模式

未设置 `TEST_DATABASE_URL` 时，UAT2/UAT3 的 API 测试使用临时 SQLite，分别跳过两项/一项 PostgreSQL 并发测试。完整并发验证需先准备独立、库名以 `_test` 结尾的 PostgreSQL 测试库，再设置：

```powershell
# 替换实际测试库账号和库名；不要指向玩家数据库
$env:TEST_DATABASE_URL = 'postgresql+psycopg://USER:PASSWORD@127.0.0.1:54329/emotional_uat_test'
# 然后重新执行上面的 UAT2 或 UAT3 命令
```

脚本不创建测试数据库。UAT3 的迁移保留测试固定使用新临时 SQLite，与 PostgreSQL 并发测试分开。恢复默认模式可运行 `Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue`。

## 已有证据与人工验收

2026-09-29 已实际运行 UAT3 入口：默认 SQLite **88 通过 / 1 并发跳过**；独立 PostgreSQL **89 通过 / 0 跳过**；两次桌面/模拟触屏浏览器均通过。最终 PostgreSQL 报告：`output/playwright/uat3/uat3-20260929-151811-dae242/report.json`。本次整理表格未重跑 UAT1/UAT2；这些数字不代表未来每次运行结果。

真实手机 Safari/Chrome、团队人工签字仍需测试。服务端计分与最终卡牌现已实现，但不属于上述 2026-09-29 历史通过范围；对应批次证据见 [计分测试指南](scoring-test-guide.md) 和 [最终结果](final-results.md)。本地预览结果与服务器记录必须分别验收。

详细说明：[UAT1](../apps/api/tests/uat/README.md) · [UAT2](../apps/api/tests/uat2/README.md) · [UAT3](../apps/api/tests/uat3/README.md) · [L3 Review](l3-backend-review.md)。
