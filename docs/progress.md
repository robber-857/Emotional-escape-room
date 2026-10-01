# 最新开发进度

> 2026-10-02 最新：新旅程使用 `event-scores-v6-search-exit` / `found-or-l2-exit-v2`。第三次点击窗帘找到时，≤15秒 A=0、>15秒 A=+2；选择不寻找或短搜后放弃（≤15秒）先保存状态，首次进入 L3 时按最终状态结算 A=-2，长搜后放弃仍为 A=+2。中途重返并找到只记找到结果，不叠加放弃扣分；从未作出搜索选择不补造放弃事件。V/T/F 为 NULL。离场结算与 L3 创建同事务，独立于家具确认截止点，重复进入不重算。旧旅程保持原策略。

更新：2026-09-30。本页按当前工作区代码核对；提交与推送状态须另查 Git，运行状态须另查服务。

| 模块 | 当前已实现 |
| --- | --- |
| L1–L4 | 同一匿名旅程的服务器动作校验、存档恢复、幂等回执；独立预览不导入正式数据 |
| 评分 | 版本化策略快照、score_evaluations / score_ledger / score_actions、动作 score_effect 与鉴权计分接口 |
| 家具 | 每次确认保存候选，首次进入 L3 结算最后确认的布局与次数，随后禁止 L2 修改；重叠采用可见轮廓 |
| 归一化 | 每关每维独立归一化，同维度按 20/30/30/20 加权；未测量维度排除，不作为零分 |
| 结果页 | 服务器最终四维、16 类卡牌映射、T/F 数值与五星；独立原画预览；卡牌文案槽位 |
| 基础设施 | PostgreSQL 17、Docker Compose、持久化卷；迁移目标 0005_scoring |

当前事件分值版本为 `event-scores-v6-search-exit`，定义版本 `server-composite-v4`，画像策略 `avtf-signs-v1`。未配置选项按已确认的临时策略设为 NULL，新旅程可完成结算；这不表示未决分值已经补齐。旧旅程绑定版本和历史回执不重写。

家具当前启用 `l2-scene-alpha-v5` / `l2-metrics-scene-alpha-v5`；拖动边界 `l2-placement-v7`，回执 `l2-validation-v9`。详见 [可见轮廓修正](l2-visual-overlap-fix.md)、[计分测试指南](scoring-test-guide.md)、[最终结果](final-results.md)。

待完成：未决评分/触发规则补全、空卡牌文案、最新版本 PostgreSQL 迁移与并发回归、George 电脑及真机人工验收、生产部署与备份恢复验证。旧 UAT3/UAT4 启动脚本仍限制旧 schema，不能直接用于当前版本，见 [测试速查](uat-test-matrix.md)。

已有测试证据按批次保留在上述功能文档；本轮仅核对代码和修正文档，没有重跑应用测试或迁移。Docker 只读检查时项目容器已停止，数据卷仍存在；实际数据库 schema 和数据完整性未重新验证。历史测试数不等于当前运行健康、真实用户验收或线上部署。

启动见 [George 交接](george-start-2026-09-30.md)，后续见 [开发计划](development-plan.md)，过去记录见 [历史进度](history/progress.md)。
