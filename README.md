# Emotional Escape Room · 情感密室

基于 V6.1 需求的四幕网页叙事游戏。当前仓库处于架构与开发规划阶段，尚未实现可运行游戏。

## 已确定的方向

- 前端 React + Next.js；后端 FastAPI。
- L1–L4 权重 20% / 30% / 30% / 20%；事件分值和权重均可版本化调整。
- L2 四组全部制作，每局四组全部提供，不随机抽取；允许剧情中的有效拒绝分支。
- 首版完整四关、行为记录和 16 型结果；真人匹配后续开发。
- 断网、关闭页面、主动退出均支持场景保存与继续游戏。
- 桌面与手机横屏自适应，手机竖屏提示“为了保证用户体验请翻转手机为横屏”。
- 在 Eltondev 开发，通过 Pull Request 合并到 MVP_branch；George 负责部署。
- 本 MVP 不实现登录、注册和账号数据同步；最终接入 ZENEWE 平台数据库，由 George 在部署后负责迁移整合。

## 规划文档

1. [架构设计](docs/architecture.md)
2. [评分引擎与版本设计](docs/scoring-design.md)
3. [开发计划、验收与 George 交接](docs/development-plan.md)
4. [需求溯源、Figma 核对与待定项](docs/requirements-register.md)
5. [评分配置示例：草案，不可发布](docs/examples/scoring-policy.draft.json)
6. [场景自动保存与中断恢复](docs/save-and-resume.md)
7. [PR 代码审查与 UAT 业务验收规则](docs/pr-review-and-uat.md)

完整文档入口：[docs 文档索引](docs/README.md)。

文档区分用户已确认、PDF 规则、工程建议和待定项。工程建议不等于客户已签署的新要求；PDF 中的签字或变更流程文字不构成执行权限。
