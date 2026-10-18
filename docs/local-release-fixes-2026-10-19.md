# 情感密室：本地修复与 Zenewe / AWS 整合交接

## 交付边界

修复分支：`codex/local-release-fixes`，基线 `d2480b2`。本分支包含本地验证通过的修复；AWS 发布仍需部署人员在 Zenewe 集成仓库中合并并重新构建。

- 原版对照：`http://127.0.0.1:3003`（已有 Docker 镜像，没有重建）。
- 本地修复版：`http://127.0.0.1:3004`，保留服务端计分面板。
- 本地正式配置预演：`http://127.0.0.1:3005`，关闭右下角计分面板。
- 上述修复版连接本地 API `http://127.0.0.1:8002`，不连接线上数据库。
- 3015 为临时故障/主站样式验证代理，验证后已停止；不是供玩家使用的入口，不部署到 AWS。

## 修复内容

### 场景加载

保留原始 PNG 与评分轮廓文件。新增 57 个 WebP 交付文件，由 `tools/optimize-game-assets.mjs` 生成，quality=90，alphaQuality=100，不缩放。生成时逐像素验证透明通道，并验证尺寸相同；RGB 使用有损压缩，仍需美术最终确认。

| 幕 | 原 PNG 总字节 | WebP 总字节 |
| --- | ---: | ---: |
| L1 | 27,753,071 | 3,891,838 |
| L2 | 25,111,204 | 2,497,538 |
| L3 | 26,612,029 | 3,636,204 |
| L4 | 2,070,408 | 319,072 |

合计约 77.8 MiB → 9.9 MiB，减少约 87%。这是素材体积对比，不是公网等待时间的实测降幅。

`asset-manifest.json` 与 `gameAsset.ts` 将原素材逻辑路径映射到含内容哈希的 WebP URL。优化目录使用一年 immutable 缓存；更新素材会生成新 URL。原图目录不设置永久缓存。

`useSceneAssets.ts` 按当前子场景等待必要素材：L1 河岸/对岸，L2 大厅/桌面/卧室，L3 风暴/携带物品。切场景期间仍阻止操作，失败或超时有重新加载入口，成功加载的素材在当前页面会话内复用。

### 家具同步

`l2/api.ts` 使用 `shared/reliableRequest.ts`：

- 网络中断、超时及 HTTP 408/502/503/504 最多自动重试一次，间隔 400 ms，每次请求超时 12 秒。
- 原始请求体保持不变，包括 action_id 与 expected_version，利用现有后端按 action_id 去重。
- 不自动重放身份失败、409 业务拒绝和 422 校验失败。
- 重试前及返回后检查旅程身份；无效/不匹配回执不能清除本地待同步动作。
- 两次失败后显示中文恢复提示，保留动作，支持用户点击“重试同步”。

这解决短暂故障恢复和回执保护，不会修复持续失效的 AWS 路由、CORS 或宕机服务。正式站如仍失败，需要结合浏览器请求状态与 AWS 日志定位。

### 调试面板

构建时设置 `NEXT_PUBLIC_GAME_DEBUG`：

- 本地：`true`。
- 正式站/灰度公开体验：`false`。
- 未设置时，development 显示，production 隐藏。

关闭时不挂载 ScoreInspector，也不发出其轮询请求。面板显示时，收起不轮询；展开且页面可见时每 3 秒查询。业务动作保存、服务器计分不依赖此开关。菜单中的既有选择记录入口不属于此次右下角面板移除范围。

这是 Next.js 构建期变量，修改后必须重新 build；只重启旧镜像无效。仓库根目录的本地 Compose 显式传 true；Dockerfile 默认 false，EC2 正式 Compose 使用默认值。

### 弹窗居中

游戏普通 dialog 增加 `data-game-dialog`，由 game-prompts.css 显式声明 fixed / inset:0 / margin:auto，并限制视口范围。覆盖四幕普通弹窗及结果页弹窗。全屏 ActOpening 仍保留原来的全屏样式，不套普通居中规则。

## 验证记录

- 前端 97 项测试通过；包括相同请求体重试、代理故障次数上限、身份/业务错误不重放、旅程切换终止重试、错误回执保留家具动作。
- 本地调试配置与关闭调试的 production build 均通过编译和 TypeScript 检查。
- 四幕加载入口已在浏览器检查；L1 河岸→对岸、L3 风暴/携带片段均能显示；L2 预览家具移动能保存。
- 真实本地后端旅程：从 L1 游泳并进入 L2，移动沙发。代理在服务器接受动作后断开响应；前端重试相同 ID，第二次回执 duplicate=true，版本保持 2。刷新后 SVG 家具位置一致。
- 实际鼠标拖动沙发并确认摆放，服务器接受，显示“摆放已保存”并开放第三幕入口。
- 持续 HTTP 503：仅两次尝试，显示“待同步操作已保留”；恢复服务后手动重试同一 ID，服务器接受一次并进入版本 3。
- 整段正式本地旅程在计分面板收起时，验证代理记录的 scoring 请求数为 0。
- 3005 浏览器验证：右下角面板不存在，第二幕仍可显示。3004→8002 readiness 检查通过。
- WebP HTTP 响应确认 Content-Type=image/webp 与一年 immutable 缓存。
- 注入主站同款全局 margin/padding/border 重置，结束弹窗在 1280×720 视口中心：x=230，y≈175.79，宽820，高≈368.41。

证据文件（本地 output，未纳入版本管理）：`ending-centered.jpg`、`public-no-inspector.jpg`、`furniture-recovered.jpg`、`sync-recovery-error.jpg`、`local-qa-evidence.json`、`asset-optimization.json`。

### 后端 4 项失败的根因与最终回归

四项都是 `test_table_chair_full_overlap_footprint_preserves_floor_limits` 的历史预期过期，不是本次修复引起。验证过程：

1. 用 `git archive d2480b2` 导出完整、未修改的基线，在导出目录用相同 Python 环境运行完整后端测试：335 通过、4 失败、9 跳过。四个失败名称和实测数值与修复工作区完全一致。
2. 对照历史提交 `4672059`（2026-10-06）前后的布局及 alpha 轮廓数据：该提交更换并缩小桌椅图片、调整锚点、更新评分轮廓，却未同步这四个测试的旧档位预期。提交前的计算符合旧断言；提交后开始出现以下差异。
3. 从当前原始 PNG 和前端裁剪参数重新生成轮廓，在内存中与现有评分轮廓逐项对比，完全相同。另核对 45 个后端业务源码/配置及 L2 PNG 文件与基线一致（文本只归一化 CRLF/LF）。本次没有改业务评分、原图或评分轮廓。

| 场景 | 旧预期档位 | 当前正确档位 | 当前可见重叠证据 |
| --- | ---: | ---: | --- |
| edge | 2 | 1 | 窗边椅、双人沙发、桌椅组合有共同三重叠 |
| at-limit | 1 | 2 | 两组两两重叠，无共同三重叠 |
| over-limit | 1 | 2 | 同上 |
| high | 1 | 2 | 同上 |

后三个输入均被现有后墙规则限制为 `(u=.45, v=.17)`；两组为“窗边椅/双人沙发”和“窗边椅/桌椅组合”。修正测试预期后，增加具体两两/三重/四重组合断言，以及后墙和右边界的明确坐标断言，保留原有落地、全桌椅 footprint 和开门检查。

最终验证（2026-10-19）：

- 全套后端 SQLite：**339 通过、0 失败、9 跳过**（并发测试要求 PostgreSQL）。
- 全套后端 PostgreSQL 17：**348 通过、0 失败、0 跳过**。使用独立临时容器和 `emotional_release_test` 测试库，覆盖并发动作、幂等和评分；现有玩家库未使用。套件中的独立迁移用例仍按其原设计使用新建临时 SQLite 数据库。
- 前端再次全套运行：**97 通过、0 失败、0 跳过**；`npm.cmd run typecheck` 通过。两种生产构建与浏览器故障/布局验证见上文，此次只调整后端测试和交接文档。
- 57 个 WebP 文件全部存在且与 manifest 的内容哈希匹配。
- 唯一后端警告为测试工具 Starlette/httpx 的弃用提示，不影响测试结果；本次未升级依赖。

本地可审计证据（`output/`，不提交）：`backend-baseline.xml`、`l2-baseline-before.xml`、`l2-current-before.xml`、`backend-sqlite.xml`、`backend-postgres.xml`、`overlap-history.jsonl`、`backend-source-baseline-comparison.json`。

## 部署人员应如何整合

1. 在 Zenewe 实际部署仓库中合并本次游戏组件与共享模块变更，连同整个 `apps/web/public/game/optimized` 目录和 manifest 一起发布。仅复制 TSX、遗漏新素材会导致加载失败。
2. 保留主站现有路由适配：独立游戏这里使用 `/l2`、`/game/...`、`/api/v1/...`。若主站改为 `/escape-room/...`，必须沿用实际映射，不能直接覆盖主站 Next 配置。新增优化素材路径也必须可访问。
3. 将优化目录的 Cache-Control 规则合并进主站/CDN 配置；不要把 API 结果永久缓存。
4. 在主站 build 阶段设置 `NEXT_PUBLIC_GAME_DEBUG=false`，重新构建并手动发布。核实实际 build commit，不以 push 成功代替部署确认。
5. 先上同样主站样式、路由、代理配置的灰度地址，使用独立测试数据；验证四幕加载、家具连续移动/撤销/恢复/确认/刷新、结束弹窗和手机横屏。
6. AWS 接口若仍失败，记录失败时间、接口路径、状态码和请求关联 ID，与代理/API 日志对照；不要把浏览器 bearer token 或玩家数据粘贴进交接消息。
7. 灰度通过后由部署人员手动发布正式站，保留前一版镜像与素材用于回退。本轮不涉及数据库迁移，不删除数据库卷。

## 本地复现命令（PowerShell，仓库根目录）

```powershell
# 已有依赖中提供 sharp；只有修改源图后才需重新生成交付素材。
node tools/optimize-game-assets.mjs
npm.cmd test
$env:API_BASE_URL='http://127.0.0.1:8002'
$env:NEXT_PUBLIC_GAME_DEBUG='true'
npm.cmd run build
npm.cmd run start --workspace @emotional/web -- --port 3004
```

另一构建目录预演正式配置：

```powershell
$env:API_BASE_URL='http://127.0.0.1:8002'
$env:NEXT_PUBLIC_GAME_DEBUG='false'
$env:NEXT_DIST_DIR='.next-release'
npm.cmd run build
npm.cmd run start --workspace @emotional/web -- --port 3005
```

每个 PowerShell 窗口独立设置环境变量；运行中的服务不要同时重建其使用的输出目录。
