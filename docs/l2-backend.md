# L2 当前后端与证据

更新：2026-09-30。对应已推送的本地版本：l2-rules-v1、l2-placement-v5、l2-validation-v6、l2-furniture-exit-v2。项目最新迁移0004_l4；L2表最早由0002_l2创建。旧过程与测试记录见[历史说明](history/l2-backend.md)。

进入要求同一匿名旅程L1完成。接口 /api/v1/sessions/{sid}/levels/l2 提供POST初始化、GET快照、POST /actions、GET /events；父会话行锁串行化、expected_version防覆盖、action_id+载荷幂等，状态和回执同事务持久化。独立preview不导入服务器。

当前行为：座位/桌边/选钥匙；任意首把试门失败、另一把成功；单一卧室探索；床头柜单一耳环入口；同意寻找后第三次窗帘点击找到。活动报告>15000ms才算长搜索，墙钟上界与累计250ms容差受限；timing_verified=false。

家具：四单元自由拖动，允许保存不合理位置；确认时分类，并**无论tidy是否成立都打开出口**。桌椅重叠检测核心收窄，地面/悬空边界不变，悬空容差包含1.4cm。50步撤销、重置、退出保存草稿、刷新恢复。进入L3使用原会话真实API，不再只进入预览。

回执保存原请求、accepted/code、previous_version/version、validation_version、authority、outcome；家具确认含layout/classification/exit_door_open/completion_policy_version。原回执不可用当前状态重造；业务拒绝可记录，但处理前的认证/结构错误并非全部入事件表。

当前评分只返回pending_configuration/contributions=null。尚无评分账本、家具截止冻结、稳定终态分类修复；重复确认同布局仍可能因baseline变化使tidy改变。见[五项优化开发任务](scoring-receipts-development.md)，不要把方案当实现。

最近检查记录见[进度](progress.md)，复现见[UAT入口](uat-test-matrix.md)，启动见[George交接](george-start-2026-09-30.md)。
