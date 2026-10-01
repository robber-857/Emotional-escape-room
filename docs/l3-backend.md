# L3 后端（基于 Eltondev / 3447d74）

> 2026-09-30 文档核对：现行迁移目标为 `0005_scoring`；评分账本、每关四维归一化及最终卡牌已实现。启动见 [George 交接](george-start-2026-09-30.md)，计算与配置边界见 [计分测试指南](scoring-test-guide.md) 和 [最终结果](final-results.md)。以下旧版本实现与验证记录按日期保留，不代表当前运行状态或本轮重测。

当前已实现服务器 API、状态机、不可变回执、迁移及正式前端接入。本机 3100/8000 与游戏数据库已更新，浏览器自动化已验证；Git 交付索引见 [L3 交接](l3-backend-handoff.md)；未生产部署，真机与 George 验收待完成。

最新 Review / UAT3：见 [审查结论](l3-backend-review.md) 与 [可执行测试说明](../apps/api/tests/uat3/README.md)。新回执使用 `l3-validation-v2`，在动作事务内保存鉴权/前置、版本、流程及额度校验证据；旧 v1 回执不回填。前端逐条展示服务器来源及校验，不以当前状态重建历史。当前工作区修复尚未提交推送。

## 会话与流程

- 复用 L1 原 session ID 与 Bearer token；L1 complete 且 L2 出口已解锁才能启动。兼容已有 L2 tidy 存档的出口判定，不回写旧档。
- `0003_l3` 仅新增 `l3_runs` / `l3_events`，不修改 L1/L2 行。事务沿用原会话行锁，状态更新与回执插入一起提交。
- `l3-flow-v1`：先回答 open，再回答 close；之后 wait/curtain/window/television 无强制顺序。是/否都算回答，六项齐全后自动进入 carry；电视状态保留。
- carry 选否为当前 L3 流程终态；选是后可预选、更换，confirm 确认唯一物品并结束当前 L3 流程。完成不等于已解锁 L4、生成分数或报告。
- 前后端状态、动作、热点和回执统一为 `television`，无双槽映射。本地预览旧 v1 日志只在读取时转换旧电源字段，新保存内容为 v2；事件 ID/时间保持原样，不增加事件、不上传服务器。为找到旧档，localStorage 键名保持原命名。

## API 合约

共同路径：`/api/v1/sessions/{sid}/levels/l3`，所有请求需要原会话鉴权。

| 方法 / 后缀 | 行为 |
| --- | --- |
| POST 空后缀，body `{}` | 首次创建；再次调用只恢复，不重置 |
| GET 空后缀 | 读取服务器两段状态、独立版本、流程完成状态 |
| POST `/actions` | 校验动作及期望版本，事务保存 |
| GET `/events` | 直接读取数据库回执，包括业务拒绝与重复确认 |

动作请求示例：

```json
{
  "action_id": "93b29058-202e-4f2e-b02f-0e9820116cb9",
  "expected_version": 0,
  "action": {"type": "decision", "slot": "open", "yes": false}
}
```

其他动作：`carry(yes)`、`draft(item)`、`confirm`。物品 ID：scarf / lantern / umbrella / compass / doll / key / journal / rope / backpack。不能提交 state、score、客户端事件时间或本地日志。

回执规则：

- 首次有效动作 `ACCEPTED`，`state_changed=true`，独立 L3 version 加一，保存一条流程事件。
- 风暴段重复否 `ALREADY_RECORDED`，HTTP 200；`state_changed=false`，不增加流程事件或版本，但保存该请求的审计回执。已执行是的动作、已结束片段不能重新选择。
- 同 ID、同完整请求重试返回原回执，`duplicate=true`；附带 `session` 是当前快照，不能用它改写原回执 outcome。同 ID 改 payload 返回 409。
- 旧版本请求返回 `VERSION_CONFLICT`；拒绝也有回执。客户端应保留待发送 ID/完整请求直到结果明确，断网/响应丢失用原请求重试；冲突后读取最新快照，再由新操作生成新 ID。
- `/events` 按接收时间、ID 稳定排序；时间相同不能据数组位置推断因果，按 `action_id` 对账、按版本解释状态变化。事件时间由服务器生成。
- 单会话最多 400 次状态变化；第 399 版停止接受物品更换并保留预选，为最终 confirm 预留额度（`CONFIRM_SLOT_RESERVED`）。重复否和原 ID 重试不消耗该额度。审计回执数可能多于流程事件数。
- 业务拒绝 HTTP 409，格式错误 422，鉴权失败 404，数据库错误 503。未启动的 GET 返回 `L3_NOT_STARTED`，不是空历史。

现行评分读取事务账本和动作 score_effect，版本随旅程绑定；旧快照的 pending_scoring 占位字段不代表评分引擎未启用。窗/电视与门组合已接结算，背包等未配置选项按 event-scores-v4-temporary-null 处理。详见 [计分测试指南](scoring-test-guide.md) 与 [最终结果](final-results.md)。

## 正式模式、本地预览与重开

`/l3` 读取原 L1 会话凭据并启动/恢复服务器 L3，不能通过 `segment=carry` 跳过服务器流程。L2 出口按当前模式进入正式 L3 或 `/l3?preview=1`。服务器状态决定两段进度、电视和物品，正式模式不调用本地 transition 或导入预览日志。

动作发送前保存待确认 ID/版本/完整请求；网络或响应丢失时原请求保留，刷新/重试仍提交原 ID。收到服务器回执后才推进场景，其他页面更新时暂停交互并提示同步；迟到响应不得覆盖已切换旅程或删除另一个待提交请求。支持 Web Locks 的浏览器按会话串行提交，服务器版本冲突校验始终有效。

正式记录菜单直接读取 `/events`，显示接受/拒绝、ID、前后版本、规则与服务器保存的结果，不能从当前状态反推历史。独立预览只显示本地记录，菜单重开也只作用于预览。正式模式提供“进入独立本地预览”，不提供清档按钮；若未来需要服务器新尝试，应另设计 attempt ID 和保留历史策略。

下一步：真机/Safari 与 George 验收；正式评分、报告和 L4 独立推进。

## 验证与运行

本轮 SQLite：111 通过、4 项并发跳过；独立 PostgreSQL：115 全通过。覆盖全部 64 种回答组合、九种物品、全否/不带、鉴权/前置、重复拒绝、幂等重试、版本冲突、并发启动/同 ID/不同 ID、回执故障回滚、两段恢复及旧档保留。

迁移测试先在新测试库升级到 0002，通过真实 L1/L2 API 产生记录，再升级 0003，逐字段比较原四张表完全一致。随后本机游戏库也已备份并迁移：迁移前后 39 个 game_sessions、187 个 game_events、18 个 l2_runs、440 个 l2_events 的内容摘要分别完全一致；之后浏览器验证创建了独立测试旅程，未修改原旅程。

前端 64 项测试、类型检查、Docker 生产构建通过。浏览器 Chromium 桌面 1280×720 / 模拟触屏 844×390：正式 L3 两组（重复否、两段/电视/物品刷新恢复、接受与拒绝回执对账、桌面响应丢失和双标签冲突）；本地预览两组（九物品、重开、异常存储、多标签、竖屏门禁、零 API）；L2 出口四组（两种设备×正式/预览）通过。自动化不等于真机或业务验收。

浏览器执行：Playwright CLI `run-code --filename apps/web/tests/l3-server.js`、`l3-preview.js`、`l2-exit.js`（后两文件同目录）。日志/截图在 `output/playwright/l3-server-integration.log`、`l3-preview-integration.log`、`l2-exit-l3-integration.log`、`l3-server-*.png`；数据库备份/摘要在 `output/db/l3-before-frontend.sql`、`l3-before.json`、`l3-after.json`。这些含本机数据的产物均被 Git 忽略，不提交。

在 `apps/api` 运行 `.venv/Scripts/python.exe -m pytest -q`。设置 `TEST_DATABASE_URL` 为以 `_test` 结尾的专用 PostgreSQL 库可运行并发；可选 `L3_MIGRATION_TEST_DATABASE_URL` 必须是尚无表、同样以 `_test` 结尾的独立库，用于 PostgreSQL 迁移证据。测试不删除数据库；重复迁移测试应使用新的空库。

本机服务已按 README 的 Compose 构建/迁移流程更新；`/ready` 已确认 `0003_l3`。`/health` 仍不代表持久化就绪。UAT2 启动脚本兼容 0002/0003。测试有既有 Starlette/httpx 弃用警告，不影响通过结果。
