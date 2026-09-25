# 项目文档索引

当前为开发前规划阶段。用户场景、工程方案、审查流程与验收证据分别维护，未实现能力不记为已交付。

| 文档 | 用途 |
| --- | --- |
| [需求来源与待定项](requirements-register.md) | PDF/Figma 依据、最新范围和需要冻结的规则 |
| [架构设计](architecture.md) | 前后端分工、数据模型、接口与响应式方案 |
| [评分设计](scoring-design.md) | 规则版本、四轴与 20/30/30/20 权重 |
| [场景保存与恢复](save-and-resume.md) | 断网、关闭、退出与草稿恢复 |
| [PR 代码审查与 UAT 业务验收](pr-review-and-uat.md) | 小功能 PR、George review、后台追踪、验收模板 |
| [开发计划](development-plan.md) | 阶段交付、工作量、验证与 George 部署交接 |
| [评分配置草案](examples/scoring-policy.draft.json) | 不可发布的配置结构示例 |

推荐阅读顺序：需求 → 架构 → 评分/存档 → PR 与 UAT → 开发计划。代码评审与业务验收按具体 commit 和规则版本记录；不以 CI、UI 截图或部署成功代替 UAT 通过。
