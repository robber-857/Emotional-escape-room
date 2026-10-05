# 四幕提示与场景视觉调整 · 2026-10-05

## 确认需求

1. 第三幕右窗：关闭窗帘时保留原样；拉开窗帘后，两扇窗扇向室内、朝镜头打开，参考左窗的内开方式。
2. 第三幕仅关窗、拉窗帘、关电源、坐稳等待隐藏常驻提示，点击区域后显示问题；半开门保留“看看门”提示，携带物品入口显示“带走一件物品？”。物品名称及后续选择方式保持原样。
3. 四幕统一确认按钮为绿色，主提示加大、加粗，辅助文字较小；同一视口下使用同一字号规则。
4. 根据用户提供的《评分.xlsx》“修订评分表”中的事件整理提示，一次操作对应其问题，尽量少于 15 字。携带入口按最新要求简化为“带走一件物品？”。
5. 第二幕通往第三幕的门打开后，门内为白光，并有柔和溢光。
6. 第四幕确认一扇门后，选择“稍后再看”，其余三门变暗，所选门保持亮度；刷新仍保留已确认状态。
7. 最终卡片底部增加粉色“找到你的另一半”按钮，正式结果、16 张预览及放大卡片共用；当前点击显示“匹配功能即将开放”，不发起网络匹配请求。

匹配扩展位置：`ResultDesign.tsx` 的可选 `onMatchRequest` 回调，参数 `MatchRequest = {portraitId, source: "result" | "preview"}`。后续由客户端调用方接入真实流程，区分预览和正式结果；当前未提供回调时只打开本地提示弹窗。

附件中的分值、随机门位、规则修订建议作为参考资料；本次修改范围是上述交互与视觉，不导入或改变评分策略、事件结算、历史旅程。

## 事件与提示对应

来源：`评分.xlsx` / `修订评分表` / `A3:H63`。表中的终态组合拆为原有可操作事件，不为“未点击”自动弹出问题或代替用户作答。

| 幕 | 事件操作 | 提示 |
| --- | --- | --- |
| L1 | 修桥材料 | 把木板和绳子移到缺口 |
| L1 | 过桥 | 要从桥上走过去吗？ |
| L1 | 直接游泳 | 要直接游泳过去吗？ |
| L1 | 救生圈 | 要用救生圈过河吗？ |
| L1 | 找船桨 | 要拨开草丛吗？ |
| L1 | 划船 | 要划船过去吗？ |
| L1 | 人物交谈 | 要和他／她打招呼吗？ |
| L1 | 拿灯、点灯 | 要拿起灯吗？／要点亮灯吗？ |
| L1 | 进入房间 | 要进入房间吗？ |
| L2 | 座位 | 要在这里坐下吗？ |
| L2 | 拿钥匙、开门 | 要拿哪把钥匙？／要用哪把钥匙开门？ |
| L2 | 进入卧室 | 要进入房间吗？ |
| L2 | 找耳环 | 要寻找另一只耳环吗？ |
| L2 | 返回大厅 | 先回大厅吗？ |
| L2 | 确认／恢复摆放 | 就这样摆放吗？／恢复家具的初始位置吗？ |
| L2 | 进入第三幕 | 要进入这扇门吗？ |
| L3 | 打开／关闭门 | 要完全打开门吗？／要把门关上吗？ |
| L3 | 等待 | 要坐稳等待吗？ |
| L3 | 右窗窗帘 | 要拉开右窗的窗帘吗？ |
| L3 | 左窗 | 要关闭左边的窗户吗？ |
| L3 | 电视 | 要关掉电视机电源吗？ |
| L3 | 携带及确认物品 | 要带走一件物品吗？／要携带【物品名】吗？ |
| L4 | 选门 | 要走进【门名】吗？ |
| L4 | 查看结果 | 要查看恋爱性格吗？ |

材料拖动、点击次数等必要操作说明保留为较小的辅助文字。主提示使用 `clamp(18px, 1.4vw, 22px)`、700 字重；辅助文字为 12–14px，按钮为 14–16px。确认按钮统一为 `#4baa8b`；按后续确认要求，绿色按钮文字统一为白色 `#fff`。

## 实现位置

- 公共提示规则：`apps/web/src/app/game-prompts.css`。
- 四幕文字及提示展示：各幕 `L1Game.tsx`–`L4Game.tsx`、L1 `model.ts`。
- 第二幕门内白光：L2 `Scene.tsx` 的 `l2-exit-door` 图层。
- 第三幕：L3 `Scene.tsx`、`CarryScene.tsx`。电视的点击区域覆盖电视及墙上开关。
- 右窗资产：`apps/web/public/game/l3/open-curtain-window-open.png`，仅通过现有右窗遮罩显示，原关闭窗帘资产保留。
- 第四幕：L4 `L4Game.tsx` / `l4.module.css`，从已确认的本地或服务器 `door` 派生亮暗，不额外存储视觉状态。

## 验证记录

- 类型检查通过；前端现有测试 81/81 通过。原绳子提示文案断言已同步简短文案，行为测试保持通过。
- 浏览器桌面 1280×720：四幕实际主提示均为 18px / 700，按钮均为 14.08px、`rgb(75, 170, 139)`。
- 956×440 横屏视口：第三幕提示不超出屏幕；第四幕关闭结果弹窗后可见一亮三暗。此项为浏览器视口验证，不是实体手机验收。
- 独立测试旅程通过真实后端完成 L1 → L2 → L3 → L4，验证白光出口、点击提示、内开右窗、携带问句、最终门选择及刷新恢复。
- 本地测试旅程 ID：`010e87e7-3000-459f-8c57-c6b9ae07cf1e`。L4 仅一条选门回执，`accepted=true`、`door=forest`；刷新后仍为一亮三暗。
- 截图保存在忽略目录 `output/playwright/`。本次未执行生产部署或真实用户验收。
- 已构建并更新本机 Docker 前端 `3003`，后端继续使用 `8002`；两者就绪检查均为 `persistence_ready=true`。3003 返回的新右窗图片与工作区文件 SHA-256 一致。
- 在更新后的 3003 再次检查真实服务器选门恢复、内开窗图层、横屏提示，期间未捕获页面运行错误；临时 3004 开发服务器已停止。

## 右窗素材生成记录

使用内置 imagegen 编辑工具。编辑目标为原右窗拉帘素材的生成版本，左窗 `storm.png` 为内开方式参考。最终文件见上面的资产路径。

最终提示词：

> Use case: precise-object-edit. EDIT TARGET = image 1; REFERENCE = image 2. Correct the rightmost curtained window in image 1. The user rejects image 1 because the casements read as opening outwards. BOTH wooden window leaves MUST open INWARDS INTO THE ROOM TOWARD THE CAMERA, matching the inward-opening left-hand window in image 2. Show physically unambiguous inward casements: hinges on the side jambs, the free vertical edges projecting forward into the room on the INTERIOR side of the stone windowsill; foreshortened glazed wooden leaves visibly in FRONT OF the curtains/wall plane, overlapping the interior sill with contact shadows. The left sash projects toward the viewer and left, and the right sash toward the viewer and right (may partly leave the right image edge); not two skinny shutters receding into the sky opening. Open angle about 60-75 degrees into room, same construction and perspective as the reference window. Keep a wide unobstructed storm-sky gap. Keep brown curtains pulled to the sides. Change only this far-right window and necessary small sash-overlap regions. Preserve camera, canvas aspect ratio, exact window opening size/location, window arch, tied curtain positions, stone columns, original door and both central windows of image 1. Do not open the central windows. No text or new objects. Full landscape image. Critical Chinese requirement: 右侧窗户的两扇窗扇向屋内、朝镜头打开，突出墙面，在窗台的室内一侧；与参考图左窗内开的方式一致。

### 后续提示与匹配入口验证

- 类型检查及 Docker 生产构建通过；现有前端测试 81/81 通过。
- 3003 浏览器验证：16 张预览各有一个可见匹配按钮；普通、放大视图均可打开并关闭占位弹窗，点击期间无网络请求。390px 宽度无横向溢出，键盘 Enter/Escape 可操作。
- 第三幕开门、关门流程可用；关门后的四个环境操作无 SVG 常驻文字。携带入口显示两行提示，八种场景物品名称仍保留。
- 匹配验证仅为本地占位交互，尚未接入匹配服务。截图：`output/playwright/match-card-desktop.png`、`match-card-mobile.png`。
- 现有计分调试浮层会遮挡页脚的放大按钮，本次通过键盘打开后完成放大视图验证；新增居中匹配按钮不受影响。


### 星级错位修复

- 新增按钮曾增大星级定位容器的高度，使百分比定位下移，导致原图星级露出。现将按钮移到图片定位容器外，保持图片与实际分数、星级原有显示。
- 正式服务端结果在 1280px、390px 宽度验证：图片和定位容器高度一致，两条星级的顶部及高度比例分别保持 717/1365、148/1365；按钮弹窗仍可用。生产构建与类型检查通过，已更新 3003。
- 携带入口已验证为单行“带走一件物品？”。
