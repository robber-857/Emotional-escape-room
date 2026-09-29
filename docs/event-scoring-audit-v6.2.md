# L1–L4：服务器事件与 V6.2 评分核对

2026-09-30。基线为 Eltondev / `21b0dc0` 加当前本地未提交修改，不能视为全部已发布到 GitHub。

主交付：[可编辑工作簿](../outputs/01a0ed34-event-audit/L1-L4_服务器事件与V6.2评分核对.xlsx)，含事件总表、V6.2 逐项核对、缺口与边界、版本化关卡权重。黄色 A/V/T/F 输入列用于后续分配分值，空白不等于零。

其他格式：[事件 CSV](data/server-events-v6.2-review.csv)、[来源与映射 JSON](data/event-scoring-audit-v6.2.json)、[数据库回执计数](data/live-receipt-audit-2026-09-30.json)、[只读核查 SQL](event-evidence.sql)。原始附件未修改；JSON 保留来源单元格、原文及文件哈希。

## 范围

- 90 条服务器动作/结果分支，另列 8 条系统或前端记录边界。这是审查行数，不是 98 个独立计分事件；部分 API 合法分支没有对应前端按钮。
- V6.2 共 19 个节点、64 个选项：27 个可映射当前终态，1 个明确不测量，其余 36 个存在定义、内容或证据缺口。可映射不代表已经启用评分。
- V6.2 按节点结果计分，不能把每次点击、拒绝、草稿和重试重复累加。NA/null 表示未测量，数值 0 表示中性分值。
- 当前开发数据库回执数 L1=380、L2=747、L3=197、L4=11，包含测试与拒绝记录；数量不代表分支覆盖或真实用户验收。

## 服务端证据

| 关卡 | 状态 / 事件表 | 证明与限制 |
| --- | --- | --- |
| L1 | game_sessions / game_events | 请求、action_id、接收时间、accepted/code、状态版本、规则版本；没有逐动作 outcome 快照，历史结果需按规则重放已接受事件 |
| L2 | l2_runs / l2_events | 回执有 previous_version、validation_version、authority、outcome；计时是受约束的客户端报告，timing_verified=false |
| L3 | l3_runs / l3_events | 校验、outcome、state_changed；ALREADY_RECORDED 且 state_changed=false 不应重复计分 |
| L4 | l4_runs / l4_events | 选门确认与终态；结果接口仍 pending_configuration，没有正式分数 |

入口分别为 apps/api/app 下的 main.py、l2_api.py、l3_api.py、l4_api.py，行为规则见同目录 domain/receipts 模块及工作簿来源列。真实旅程 actions 响应、events 历史和数据库 action_id 可逐条对账，独立前端预览不能代替这些证据。

同 action_id、同请求重试复用原回执；同 ID 换请求会冲突。业务拒绝可能持久化，但认证失败、结构错误和前置失败并非全部写入事件表，不能声称所有 409 都有回执。服务端证明游戏动作与状态，不证明玩家动机。

## 优先补齐

| 项目 | 差异 / 待定事项 |
| --- | --- |
| L1 线索与人物 | 缺少采纳线索、主动交谈、从未点击人物的独立证据；先定义事件和结算时点 |
| L2 钥匙与门 | 选钥匙不能直接等同反复比较；单个 explore 流程不能独立代表两类门节点 |
| L2 耳环 | 代码长搜索 >15 秒，V6.2 为 ≥15 秒；快速找到无对应评分选项 |
| L2 家具 | 当前布局判定不是四分位常模；需定义墙窗距离、整齐度与调整次数；计数不能只读最多 50 条撤销历史 |
| L3 风暴 | 当前是电视，V6.2 是电扇；部分合法开关门组合无评分选项 |
| L3 携物 | 背包缺分值；不携带明确全 NA，不自行添加携带基础分 |
| L4 门 | 可映射四个终态，但名称与位置固定，未做随机化 |
| 附件完整性 | 仅两张表，变更说明 C22 含 #REF!；未附所引用参数、计算器、常模等工作表 |

## 权重版本

[服务器配置](../apps/api/app/config/scoring-weights.json)当前 active_version 为 Scoring_weight_version_1，L1/L2/L3/L4=0.20/0.30/0.30/0.20。更改时保留 v1，在 versions 新增 Scoring_weight_version_2，填写新值并修改 active_version。每项 0–1、合计 1；允许零，不允许缺项。

apps/api 下执行 `.venv/Scripts/python.exe -m app.scoring_weights` 校验。Docker 重建后执行 `docker compose exec api python -m app.scoring_weights`。Excel 权重表不会自动写入服务器 JSON。

本轮仅实现配置读取与校验，尚未接入正式算法或会话权重快照。后续结果须冻结事件评分版本、权重版本和实际权重；不能无记录地用新权重覆盖历史结果。算法等待用户提供，附件中的收缩、常模、节点权重等暂不实施。

验证：后端 179 passed / 6 skipped；默认 SQLite 跳过 PostgreSQL 并发项。工作簿验证版本切换、零权重与空白区别。这不等于 George 另一台电脑 UAT。
