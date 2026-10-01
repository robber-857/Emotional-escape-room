# L2 当前后端与证据

更新：2026-09-30。当前工作区为 l2-rules-v1、l2-placement-v7、l2-validation-v9、l2-furniture-exit-v2。项目迁移目标 0005_scoring；L2 表最早由 0002_l2 创建。旧验证见 [历史说明](history/l2-backend.md)，不代表本轮重测。

进入要求同一匿名旅程L1完成。接口 /api/v1/sessions/{sid}/levels/l2 提供POST初始化、GET快照、POST /actions、GET /events；父会话行锁串行化、expected_version防覆盖、action_id+载荷幂等，状态和回执同事务持久化。独立preview不导入服务器。

当前行为：座位/桌边/选钥匙；任意首把试门失败、另一把成功；单一卧室探索；床头柜单一耳环入口；同意寻找后第三次窗帘点击找到。活动报告>15000ms才算长搜索，墙钟上界与累计250ms容差受限；timing_verified=false。

家具：四单元拖动按占地限制地面范围；确认即开出口，不以 tidy 阻塞进入 L3。当前评分重叠使用图片可见轮廓，策略 l2-scene-alpha-v5；见 [轮廓修正](l2-visual-overlap-fix.md)。每次确认保存候选；首次创建 L3 时结算最后确认布局及当时次数，之后 L2 动作返回 L2_FINALIZED。未确认草稿不混入评分，重复进入不重复结算。

回执保存原请求、accepted/code、previous_version/version、validation_version、authority、outcome；家具确认含layout/classification/exit_door_open/completion_policy_version。原回执不可用当前状态重造；业务拒绝可记录，但处理前的认证/结构错误并非全部入事件表。

评分已接服务端事务账本与动作 score_effect，见 [计分测试指南](scoring-test-guide.md)。旧快照中的 scoring 待配置占位字段仍保留，实际分数读取鉴权 /scoring；不能用占位字段推断整个评分引擎未启用。

最近检查记录见[进度](progress.md)，复现见[UAT入口](uat-test-matrix.md)，启动见[George交接](george-start-2026-09-30.md)。

2026-10-02 前端入口修复：“回到桌边拿钥匙”不再要求先到过桌边才可用；首次使用先提交 arrive-table，再切换桌面并打开钥匙选择。已有桌边权限不重复提交到达事件。桌面/模拟触屏已验证首次无钥匙和首把失败后拿第二把；类型检查、Docker构建通过并更新本机3100。
