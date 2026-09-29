# L2 独立 UAT 执行入口

Windows 可直接双击本目录 `run.cmd`；它会打开 PowerShell 执行 `run.ps1`，结束后保留窗口显示结果。命令行或自动化使用 `run.ps1`，失败退出码为 1。

```powershell
# 从仓库根目录运行；也可以从其他目录使用脚本绝对路径
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/tests/uat2/run.ps1 -BaseUrl http://127.0.0.1:3100
```

前置条件：本项目 Web/API/数据库已启动，schema 为 `0002_l2`、`0003_l3` 或 `0004_l4`，API 的 `.venv` 已按仓库 README 安装依赖，宿主机有 Node/npm、Chrome，首次运行可下载 Playwright CLI。脚本不会自动重建服务、删除数据或重置现有玩家存档。

默认 API 测试使用临时 SQLite，**跳过两项 PostgreSQL 并发测试**，日志和报告明确记录这个限制。需要完整并发验证时传入专用、名称以 `_test` 结尾的 PostgreSQL 库连接串：

```powershell
# TEST_DATABASE_URL 由你在当前环境设置，禁止指向玩家库
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/tests/uat2/run.ps1 -TestDatabaseUrl $env:TEST_DATABASE_URL
```

## 自动执行范围

1. 检查 Web 同源 API 的数据库 readiness / schema_version。
2. 运行 `test_l2_api.py`：L1 门槛、权限隔离、动作顺序、家具边界、计时边界与累计容差、幂等/版本、事件上限、不可变回执等；传入 PostgreSQL 测试库时包含并发用例。
3. 运行 `l2-acceptance.js`：桌面 1280×720 和触屏模拟 844×390，各自新建隔离浏览器上下文，真实完成 L1 再进入同会话 L2。覆盖钥匙、卧室、窗帘三次、家具、无变化操作、刷新、断网、多标签、丢失真实已提交响应后的同 ID 重试。桌面额外验证 >15 秒报告与菜单暂停。
4. 从真实 API 返回回执，对照前端每条事件的 ID、来源和接受/拒绝状态；确认第一次钥匙失败的历史结果没有被后来开门成功改写。验证筛选、记录请求失败时不展示旧记录、重试恢复。

浏览器测试会向本地 API 创建测试旅程并保留数据库记录；不改写客户端已完成状态、不伪造 API 成功响应。非法请求与断网/响应丢失是明确的测试步骤。不会操作你当前浏览器里的玩家旅程。

## 输出与判断

每次输出在 `output/playwright/uat2/uat2-时间-随机ID/`：

- `report.json`：整体 PASS/FAIL、API/浏览器阶段、数据库模式、桌面与触屏结果、测试 session_id。
- `api.log`、`api-results.xml`：后端日志及 JUnit 结果。
- `browser.log`：浏览器脚本输出和失败信息。

截图位于 `output/playwright/l2-uat2-trace-desktop.jpg`、`l2-uat2-trace-mobile.jpg` 等，后续运行会更新这些截图。日志不输出会话 token，不提交 Git。

## 人工验收仍需填写

| 检查 | 人工结果 |
| --- | --- |
| 真实手机 Safari/Chrome 横竖屏与触摸 | 未执行 |
| 网络抖动、锁屏、强退/断电后的活动片段恢复 | 未完成完整矩阵 |
| 设计方对家具阈值与四组交互签认 | 待签认 |
| 最终评分表 | 尚未启用，不以零分代替；L2 家具通关条件已实现，见最新开发文档 |

服务器是动作判定、持久化进度和回执的权威来源；寻找时长仍是客户端活动报告，服务器进行约束校验，不等于服务器证明真人活动。自动化通过不是上述人工项目签字。
