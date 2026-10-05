# 项目文档入口

更新：2026-09-30。**本轮计分实现与测试以 [计分测试指南](scoring-test-guide.md) 为准，已确认评分规则以 scoring-design.md 为准。** 四关已接服务器，评分引擎及测试面板已启用；最终四维与画像映射已接入；未决分值按临时 NULL 策略处理，详见 [最终结果](final-results.md)。旧进度已归入 history，不能把历史的“未实现/未推送”当成当前状态。

| 阅读顺序 | 文档 | 用途 |
| --- | --- | --- |
| 1 | [最新进度](progress.md) | 已实现、待开发、最近测试及交付 |
| 2 | [George 启动](george-start-2026-09-30.md) | 拉取、数据库、迁移、前后端与Docker |
| 3 | [评分规则](scoring-design.md) | 操作与组合评分分层、已确认向量、得分表维护 |
| 4 | [最终事件与评分对照](event-scoring-audit-v6.2.md) | 唯一最终表、原始动作及V6.2来源 |
| 5 | [回执优化开发任务](scoring-receipts-development.md) | 原开发规格、字段、事务、版本、验收 |
| 6 | [测试入口](uat-test-matrix.md) | UAT命令与验证边界 |

实现说明：[游戏封面](game-cover.md)、[L1](l1-backend.md)、[L2](l2-backend.md)、[L3](l3-backend.md)、[L4](l4-backend.md)、[结果页](final-results.md)。接口事实以代码与对应版本回执为准。

L2 当前重叠采用 [可见轮廓算法](l2-visual-overlap-fix.md)，不是早期地面矩形；靠墙与次数规则见 [计分测试指南](scoring-test-guide.md)。[整理房间升级](l2-04-upgrade.md)保留阶段演进。

历史与设计参考：[历史进度](history/progress.md)、[早期评分设计](history/scoring-design.md)、[需求来源](requirements-register.md)、[架构规划](architecture.md)、[存档设计](save-and-resume.md)。开发过程和Review中带日期的测试数是当时记录，不是本轮重跑。
