# 项目文档索引

> 2026-09-27 L1 后端接入更新：当前实现与边界见 [L1 后端设计](l1-backend.md)，跨电脑启动见 [George 交接](george-local-setup.md)。下文早期骨架状态/全项目规划请按日期区分。

当前已实现 L1/L2 前端、FastAPI 权威动作校验与 PostgreSQL 存档，L2 沿用完成 L1 的原会话。正式评分待配置，尚不计算分数；用户场景、工程方案、审查流程与验收证据分别维护。

| 文档 | 用途 |
| --- | --- |
| [L3 后端接续交接](l3-backend-handoff.md) | 下一对话首读：最新确认规则、存档结构、已提供向量与后端待办 |
| [L3 前端独立预览](development-l3.md) | 风暴六组选择、九选一、本地存档；明确待补素材和正式通行/后端边界 |
| [George Review：L1 / L2](george-review.md) | 统一审查入口：重点结论、测试证据、待办与后续代码质量审查 |
| [L1 正式开发文档](development-l1.md) | 本轮代码、图层、状态机、工程默认规则 |
| [L2 交互设计与实施说明](development-l2.md) | 四组流程、提示、合理摆放与空旷建议；明确已确认/待确认边界 |
| [L2 后端与 L1 衔接](l2-backend.md) | 原会话延续、动作事务、服务器家具判断、计时边界、评分留口 |
| [L2 后端 Review](l2-backend-review.md) | 已修复问题、服务器事件来源、保留的计时与评分边界 |
| [L2 UAT2 执行说明](../apps/api/tests/uat2/README.md) | 双击 run.cmd 或执行 run.ps1，真实后端与浏览器对账 |
| [开发进度](progress.md) | 已实现、验证结果、未完成与后续顺序 |
| [需求来源与待定项](requirements-register.md) | PDF/Figma 依据、最新范围和需要冻结的规则 |
| [架构设计](architecture.md) | 前后端分工、数据模型、接口与响应式方案 |
| [评分设计](scoring-design.md) | 规则版本、四轴与 20/30/30/20 权重 |
| [场景保存与恢复](save-and-resume.md) | 断网、关闭、退出与草稿恢复 |
| [PR 代码审查与 UAT 业务验收](pr-review-and-uat.md) | 小功能 PR、George review、后台追踪、验收模板 |
| [开发计划](development-plan.md) | 阶段交付、工作量、验证与 George 部署交接 |
| [评分配置草案](examples/scoring-policy.draft.json) | 不可发布的配置结构示例 |

推荐阅读顺序：需求 → 架构 → 评分/存档 → PR 与 UAT → 开发计划。代码评审与业务验收按具体 commit 和规则版本记录；不以 CI、UI 截图或部署成功代替 UAT 通过。
