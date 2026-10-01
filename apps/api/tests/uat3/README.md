# L3 UAT3

> 2026-09-30 兼容性提示：现行应用迁移目标为 `0005_scoring`，但本目录 run.ps1 仍只接受旧 schema，会在 readiness 阶段阻止运行。以下是旧版本使用与验证记录。需更新版本判断及行为断言后再进行新版验收；不要降级游戏数据库来适配旧脚本。详见 [测试速查](../../../../docs/uat-test-matrix.md)。

Windows 双击 **`run.cmd`** 即可运行；默认检查 `http://127.0.0.1:3100`。命令行可运行：

```powershell
.\apps\api\tests\uat3\run.cmd -BaseUrl http://127.0.0.1:3100
```

前置：按仓库 README 启动本项目 Web/API/PostgreSQL，`/api/v1/ready` 为 `0003_l3` 或 `0004_l4`；API 的 `.venv` 已安装依赖，Node/npm 与 Chrome 可用，首次运行 Playwright CLI 可能需要网络。先更新本地服务，确保支持 `l3-validation-v2` 回执。

脚本会执行隔离 API 测试和桌面/模拟触屏浏览器验收。退出码 0 为通过，1 为失败；报告、API JUnit、浏览器日志、截图存放于 `output/playwright/uat3/<run-id>/`。这些是本机测试证据，不等于真机 Safari、生产部署或 George 签字。

## 验证范围

- 原会话/L2 通关前置、六项回答与九选一/不带、非法输入、幂等、版本冲突、事务回滚、额度边界、旧回执不改写。
- 迁移使用独立临时 SQLite，从 0002 升级 0003 并比较 L1/L2 数据；不会迁移正在运行的游戏库。
- 浏览器经真实 API 建立专用测试旅程，再从 L2 页面进入 L3；测试不会借用用户已有会话。L1/L2 的浏览器操作全旅程由原 UAT1/UAT2 覆盖，此处准备步骤使用真实 API。
- 桌面验证已提交响应丢失后同 ID 重试及双标签冲突；模拟触屏验证断网重试；两种尺寸均检查恢复、重复否、电视/物品、接受/拒绝回执与历史结果。
- 每条 UI 回执与 `/events` 的 action/outcome/authority/validation/scoring 完整对账；服务器记录读取失败时必须显示失败，不能用前端状态补造历史。

## PostgreSQL 并发模式

默认 API 部分是临时 SQLite，报告会标明并发测试 **SKIPPED**。指定独立、以 `_test` 结尾的 PostgreSQL 库才能验证并发：

```powershell
$env:TEST_DATABASE_URL = 'postgresql+psycopg://USER:PASSWORD@127.0.0.1:54329/emotional_uat3_test'
.\apps\api\tests\uat3\run.cmd -BaseUrl http://127.0.0.1:3100
```

请换成实际测试库配置，不要使用游戏库。脚本不创建或删除数据库，不打印凭据；只在测试库运行 API 测试。环境中的 `L3_MIGRATION_TEST_DATABASE_URL` 会在运行时暂时隔离，迁移检查固定使用新临时库，结束后恢复原环境。并发模式与迁移检查的数据库类型分别写入报告。

浏览器部分会在 BaseUrl 对应服务中新增两个独立测试旅程，session ID 写入报告，测试 token 不写入报告。不会清空现有数据库、预览存档或玩家历史。运行失败时先查看 `report.json` 与 `api.log` / `browser.log`，修复后重跑。
