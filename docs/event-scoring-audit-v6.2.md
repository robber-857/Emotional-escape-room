# 最终事件与评分对照表

确认：2026-09-30，用户指定电视确认版为唯一最终事件与评分对照表。最终交付：[组合比对工作簿](../outputs/01a0ed34-event-audit/本地事件与V6.2评分组合比对表_电视确认版.xlsx)、[评分结果CSV](data/composite-scoring-events.csv)、[操作归属CSV](data/current-events-scoring-review.csv)、[完整来源JSON](data/scoring-event-comparison.json)。

48个评分结果候选按评分组互斥结算；44条本地操作/结果行用于证据归属，不能当作44个独立得分项。修桥与走桥、修船与过河是组合；灯及关窗/关电视按四种终态只选一个。窗/电视沿用原表电扇组合F+2/0/0/−2，已移除“缺电视向量”标记。

原始附件64行向量保留原文，不直接改写来源中的电扇字样；现行规则注明用户批准的电视替换。缺失、明确NA、明确0分别标识。机械过程不加分；正式评分引擎未启用。

| 服务器证明 | 数据表 | 边界 |
| --- | --- | --- |
| L1 | game_sessions/game_events | 接受请求按规则版本可重放；无逐动作独立outcome快照 |
| L2 | l2_runs/l2_events | 不可变outcome、前后版本和校验版本；计时为bounded_client_report |
| L3 | l3_runs/l3_events | choices、物品、state_changed及校验回执 |
| L4 | l4_runs/l4_events | 最终门和幂等回执；最终评分仍pending_configuration |

回执能证明服务器接受的动作/状态，不能证明玩家心理或真人注意时长。当前快照不能替代历史结果。查询用[只读SQL](event-evidence.sql)；[2026-09-30计数](data/live-receipt-audit-2026-09-30.json)仅是当时开发库快照，不是当前实时数量或覆盖率。

仍待解决：背包、未开却关门的合法组合、快速找到耳环等未覆盖结果；家具原表四分位与当前分类的映射；探索原表两节点与当前单一流程的映射；座位和部分未做结果的截止。不因原表描述新增游戏事件。

开发接续：[评分规则](scoring-design.md)、[回执与评分开发任务](scoring-receipts-development.md)。旧版工作簿及预览文件已清理，旧内容仅通过Git历史追溯。CSV/JSON为本表的配套数据，不是另一个评分版本。

“最终”确定的是当前事件清单及评分对照基准；表中明确标记的缺分/待确认项仍保持该状态，不能自动补零，也不表示评分引擎已上线。
