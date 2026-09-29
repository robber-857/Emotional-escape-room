# UAT4：选门服务器验收

前置：本项目 Web/API/PostgreSQL 已启动，`/api/v1/ready` 为 `0004_l4`；API `.venv`、Node/npm、Chrome 可用。脚本会创建独立测试旅程并保留回执，不修改既有玩家旅程，不自动迁移或重建服务。

Windows 双击 `run.cmd`，或在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/tests/uat4/run.ps1 -BaseUrl http://localhost:3000
```

Docker 网页端口按本机配置替换（例如 3100）。默认 API 测试采用临时 SQLite，明确跳过 PostgreSQL 并发。设置 `TEST_DATABASE_URL` 或传入 `-TestDatabaseUrl` 可启用专用 PostgreSQL 测试库，数据库名必须以 `_test` 结尾，绝不能使用玩家数据库。

覆盖：

- API：前置鉴权、四门 × 带/不带物品、终态不可更换、版本冲突、严格拒绝伪造数据、同 ID 重试/换载荷拒绝、不可变历史、事务回滚。
- PostgreSQL 模式额外验证并发开始、同 ID 竞争和不同门竞争。
- 迁移测试始终使用新建临时 SQLite，验证升级前后 L1–L3 六表不变。
- 浏览器：桌面/模拟触屏、L3 离场、正式/预览隔离、服务器携带物品、取消、离线重试、丢失已提交响应、跨标签页同步、刷新恢复、回执逐条对账、回执接口失败恢复。

结果写入 `output/playwright/uat4/<run-id>/`，包括 API 日志、JUnit XML、浏览器日志、截图和 `report.json`。`PASS` 不等于真机或生产 UAT；评分与报告不在此次范围内。
