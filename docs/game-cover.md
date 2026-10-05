# 游戏封面

更新：2026-10-06。

首页 `/` 在第一幕之前显示独立封面。Web 使用横版黑金封面，点击「进入你的故事」后进入原有第一幕欢迎页，再选择开始或继续上次旅程。

手机开场顺序：

| 时间 | 显示 |
| --- | --- |
| 0 秒 | 纯黑 |
| 0.5 秒 | 中央微光 |
| 1 秒 | 金色拱门、情感密室 Logo 和文案渐显 |
| 2 秒 | 竖屏显示转动手机的图示与提示 |
| 横屏后 | Logo 保留 1.2 秒，淡出 0.8 秒，进入第一幕欢迎页 |

打开时已经横屏的手机也会播放开场，再自动进入第一幕。横屏等待／淡出时转回竖屏会取消进入；浏览器切到后台也会取消进入，回到前台后重新等待。系统开启减少动效时缩短开场和淡出并停止循环动画。

封面结束前不挂载 `L1Game` 或 `ScoreInspector`，不读取或修改游戏存档，不请求游戏 API，也不创建会话或计分。已有开始、继续、待同步记录和 `?restart=1` 的语义保留；显式重新开始也要等封面结束才执行。其他关卡和结果页不显示封面。

实现入口：

- `apps/web/src/features/cover/GameShell.tsx`：首页门控与游戏挂载。
- `apps/web/src/features/cover/GameCover.tsx`：时间阶段、设备／横屏检测与过渡。
- `apps/web/src/features/cover/cover.module.css`：响应式布局与动效。
- `apps/web/public/game/cover/doorway.svg`：透明背景的金色拱门资产。
- `apps/web/src/app/layout.tsx`：接入入口与游戏标题。

浏览器验收使用现有 Playwright CLI 工作流：

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=cover open http://127.0.0.1:3102
npx.cmd --yes --package @playwright/cli playwright-cli -s=cover run-code --filename apps/api/tests/uat/cover.js
```

运行前创建 `output/playwright/cover`；端口按实际启动地址调整。脚本使用独立浏览器上下文，拦截并模拟所有游戏 API，不创建真实旅程。覆盖桌面、窄桌面、手机开场／旋转、旋转取消、初始宽横屏、减少动效、旧存档原始值保留、第二幕直达及重开参数。截图保存在 `output/playwright/cover`。已有游戏 UAT 的首页访问和第一幕刷新需要先通过封面，再进行原有开始／继续操作。

本地类型检查、84 项现有前端测试和生产构建通过。10 项封面浏览器场景全部通过，包含 320×568 竖屏、667×375／844×390／956×440 横屏；未出现页面异常或溢出，封面期间游戏 API 请求为零，旧会话及待同步记录的原始值保持不变。验收日志为 `output/playwright/cover/acceptance.log`；这是 Chromium 桌面／触屏模拟与 API mock 的证据，真机 Safari／Chrome 和远端发布尚未验证。现有游戏 UAT 已补上封面入口步骤并通过语法检查，未在本轮重跑完整真实 API 游戏流程。
