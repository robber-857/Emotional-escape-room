# L2 画面重叠漏算修复

## 原因与修改

旧版 `l2-metrics-full-footprint-v4` 只比较地面占位矩形。桌椅与单人沙发、窗边椅与双人沙发在画面中互相遮挡时，底部占位仍可能不相交，错误显示 0 对。

新版 `l2-metrics-scene-alpha-v5` 使用现有 PNG 的透明通道，按 Scene.tsx 的裁切、平移和透视缩放计算共同覆盖面积。透明空白及 CSS 投影不计；alpha 阈值 128，场景原尺寸每 4 像素采样，近边缘仍有采样误差。不是整张图片外接矩形。两两、三重、四重以共同面积判断，四档及分值不变。

地面边界、靠墙指标、调整次数保持原逻辑；旧 `tidiness` 连续值及 `overlapPairs` 保留为地面诊断。正式分档读取 `overlapGroups`，其 `method` 标明轮廓版本。历史确认及已结算记录不重写；面板明确提示历史地面算法。

轮廓源文件：`apps/api/app/config/l2-overlap-masks.json`，前后端共用。素材或 Scene.tsx 裁切变动时，在仓库根目录执行 `node scripts/l2-overlap-masks.cjs` 并重新验证；测试校验素材 SHA-256。

## 本地验证

- 后端相关回归 101 通过，4 项 PostgreSQL 并发测试在 SQLite 下跳过；新增素材哈希测试单独 1 通过。
- 前端 80 项通过，TypeScript 检查通过。
- 真实浏览器：API 准备同类布局，UI 确认并进入第三幕，面板及账本均为 **2 对、第 2 档、F -1**；重复请求幂等、刷新保持结果。1440×900 与 390×844 截图已保存。此验证不是用户原会话的精确坐标重放，也不是完整触屏拖动 UAT。
- 截图：`output/l2-overlap-scene.png`、`output/l2-overlap-settled-desktop.png`、`output/l2-overlap-settled-mobile.png`。
- 浏览器脚本：`apps/api/tests/uat/l2-visual-overlap.js`，使用 Playwright CLI 的 `run-code --filename` 运行。

## 当前验证入口

- 前端 http://127.0.0.1:3120 → 后端 http://127.0.0.1:8120。
- 独立数据库 `output/l2-overlap-8120.db`；`/api/v1/ready` 确认 persistence_ready。不是生产发布。
- 原 3000 进程及其 API 连接未切换。新验证入口需新旅程；原有已结算旅程不会自动重算。
- 3120 使用 `API_BASE_URL=http://127.0.0.1:8120` 和 `NEXT_DIST_DIR=.next-overlap`，与 3000 构建输出隔离。
