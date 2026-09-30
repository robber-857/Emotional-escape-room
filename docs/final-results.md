# 最终恋爱性格结果（待评分配置）

- L4 确认选门成功后弹出“来看看你的恋爱性格吧”；刷新已完成的 L4 也可重新进入。
- `/results` 使用旅程凭证读取 `GET /api/v1/sessions/{sid}/result`。复用 L1–L4 完成校验，读取时锁定旅程以获得一致版本，不写入或重算历史回执。
- `/results?preview=1` 和 `/results/design` 仅展示 16 种素材，允许切换，没有实际结果或分数。
- 正式响应包含 `schema_version`、`input_versions`、`policy_version`、`portrait_id`、AVTF `vector`、`metrics.authenticity/love`（score、stars）。未配置时后三项及 policy_version 为 null，状态为 `pending_configuration`。
- 服务端 `results.evaluate_journey` 是未启用的策略扩展点。仍需事件加分、向量归一化、16 类映射、两个展示指标的计算公式；不能仅根据选门推断。
- 星级严格采用 [0,20)、[20,40)、[40,60)、[60,80)、[80,100]。100 分计为五星，超出 0–100 的输入拒绝；不截断、四舍五入或伪造缺失分数。
- 当前页面使用完整原画，正式ready结果仅覆盖两个评分区域，显示服务器返回星级；未配置时保留待生成状态并提供原画预览入口。预览明确说明原图星级不是玩家测评结果。
- 后续发布正式策略时须补充策略版本冻结和最终结果持久化；本次接口尚不宣称产出正式测评结果。

验证：结果接口和 L4 SQLite 测试 46 passed / 1 PostgreSQL 并发测试 skipped；Next 构建通过；L4 预览跳转通过。浏览器使用隔离模拟响应验证待生成→ready、指定画像、3/5 星与移动端展示，这不等同于真实评分验收。

