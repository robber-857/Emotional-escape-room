# L4 后端与前端接入

## 已实现

- 沿用 L1 原会话与 Bearer 凭据；服务器依次检查 L1、L2、L3 已完成。L3 携带一件物品或明确不带，都可进入。
- 进入 L4 创建或恢复存档；携带物品从 L3 数据库状态继承。确认前的查看/取消仅为 UI 行为。
- 确认一扇门后 L4 完成、不可更换。门 ID：`village`、`coast`、`forest`、`castle`；位置及画面沿用当前前端。
- 原会话行锁串行化开始与确认；版本冲突和已完成后的新操作返回拒绝回执。同一 `action_id`、同一请求重试复用原回执；同 ID 换请求拒绝。
- 状态与回执在同一事务保存。回执记录输入、鉴权/前三幕/版本/流程校验、当时结果及规则版本；历史结果不从当前状态补造。
- 正式 `/l4` 从服务器读取；发送前持久化待发送请求，断线/响应丢失后复用同一 ID，确认成功后才更新画面。右上角菜单读取服务器回执。
- `/l4?preview=1` 保留独立本地体验。旧 `emotional:l4:preview:v1:*` 记录不导入服务器，也不能解锁正式关卡。

## API

统一前缀 `/api/v1/sessions/{sid}/levels/l4`，均需原会话鉴权。

| 方法 / 路径 | 用途 |
| --- | --- |
| POST 根路径，body `{}` | 创建或恢复 |
| GET 根路径 | 读取服务器存档 |
| POST `/actions` | 提交选门确认 |
| GET `/events` | 读取不可变回执 |

```json
{"action_id":"UUID","expected_version":0,"action":{"type":"confirm","door":"forest"}}
```

请求严格拒绝额外字段、未知门、非整数版本、伪造状态/物品/评分。前置条件或鉴权不通过不创建 L4 存档；合法格式且通过前置检查的接受/拒绝请求均有回执。

规则：`l4-flow-v1`；完成策略：`l4-confirm-door-v1`；校验：`l4-validation-v1`。
L4 门选择已接服务端评分账本；完成四关的新旅程可读取最终四维、卡牌与 T/F 星级。旧快照的评分占位字段不是最终结果；以鉴权 /scoring 和 /result 为准，见 [最终结果](final-results.md)。

## 数据库与验证

`0004_l4` 仅新增 `l4_runs` / `l4_events`，不改 L1–L3 表。先备份，按根 README 的 Compose 流程更新；当前还需后续 `0005_scoring`（新增三张评分表），以 `/api/v1/ready` 的 `0005_scoring` 为就绪依据。

2026-09-29 本机验证：

- 后端临时 SQLite：136 通过、5 项并发跳过；独立 PostgreSQL 测试库：141 全通过。
- 前端：69 项通过，类型检查、本机生产构建和 Docker 网页构建通过。
- UAT4 桌面/模拟触屏两组通过：真实 API 建立前置旅程、两种 L3 离场、物品继承、取消不写入、响应丢失/离线重试、跨页同步、刷新恢复、终态拒绝、回执对账及接口失败重试、预览隔离。
- 本机 API 与 Docker 网页（3100）已升级，开发网页（3000）及 Docker 构建均通过 UAT4 桌面/模拟触屏检查。游戏库迁移前后原六表计数与 SHA-256 摘要一致；备份与摘要位于忽略目录 `output/l4-backend/`。
- 浏览器报告：`output/playwright/uat4/uat4-20260929-173543-073e16/report.json`。该次脚本默认 SQLite；并发证据来自单独的全套 PostgreSQL 测试，见 `output/l4-backend/postgres-tests.log`。
- UAT3 兼容回归通过（88 项 API/迁移通过、1 项并发跳过、两组浏览器通过），报告：`output/playwright/uat3/uat3-20260929-173843-90bd49/report.json`。UAT2/3 入口已兼容 `0004_l4`。

可复跑入口：[UAT4](../apps/api/tests/uat4/README.md)。未生产部署；真机、George 验收、正式评分/报告仍未完成。
