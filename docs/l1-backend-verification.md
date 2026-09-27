# L1 前后端验证记录

日期：2026-09-27。范围：本机 Windows + Docker Linux containers；不是 George 电脑或真实手机 UAT。

- 前端 17 项测试通过：原有 14 项关卡规则/恢复测试 + 3 项服务器客户端测试（响应丢失后重试、服务器拒绝、摆放草稿校验）。
- TypeScript 检查通过；Linux Docker 内 Next.js production build 通过。
- API 在临时 SQLite 下 8 passed / 1 PostgreSQL 专属并发测试 skipped。
- API 在专用 PostgreSQL emotional_test 下 9 passed，含 SELECT FOR UPDATE 并发版本冲突。
- Compose 从空项目数据库卷启动成功；migrate 退出 0，db/api/web healthy。8000 已占用，因此本机未提交 .env 使用 WEB_PORT=3100 / API_PORT=8100 / DB_PORT=54329。
- 浏览器真实操作：开始会话 → 搜草一次 → 断网第二次操作，计数仍为 1 → 恢复网络并刷新 → 重试同步，服务器版本为 2，恰好两条接受记录。
- 浏览器真实拖拽：只放木板时不修桥；再放绳子触发 collect-wood 与 repair 两条服务器接受事件；确认过桥后到对岸。
- 重启 API 和 PostgreSQL，数据库仍为 version=5 / scene=shore / repaired=true；浏览器刷新并继续后恢复对岸。
- 浏览器确认进门，服务器接受 enter、version=6，显示第一幕结束。
- 菜单开发记录已显示服务器事件 ID、接受状态和版本；截图在 output/playwright/l1-server-receipts.png（验证产物不入 Git）。

修复：首次浏览器断网检查发现 pending 状态误禁用重试按钮，已修复并成功复测刷新后的重试流程。

限制：浏览器完整实走了修桥路线与断网恢复，其余路线/人物/灯组合由 API 和原有前端测试覆盖；未完成全部路线的浏览器矩阵或真实手机 UAT。故意断网产生一次 ERR_INTERNET_DISCONNECTED 控制台错误。测试依赖存在 Starlette 关于 httpx 的弃用提醒，不影响本轮测试结果。

正式人格评分、L2–L4、账号/跨设备恢复、Service Worker/IndexedDB 队列、生产发布未实现。源码与配置尚需提交/共享给 George，再在他的电脑独立执行交接验收。

后续完整四路线浏览器 UAT 与修复记录见 [2026-09-28 UAT](../apps/api/tests/uat/RESULTS-2026-09-28.md)。本文件保留 2026-09-27 首轮验证范围。
