# 场景自动保存与中断恢复

日期：2026-09-25。用户已确认纳入 MVP：断网、关闭页面、主动退出后继续原场景。本文是开发设计，尚未实现。

## 保存内容与职责

保存关卡、场景/镜头、剧情步骤、任务进度、物品栏、物件状态、已确认选择、钥匙/船桨进度、家具归一化布局、有效计时、内容/评分/文案版本、revision 和更新时间。恢复到同一逻辑场景的安全静态状态，不恢复动画某帧或重放动画副作用。

- 服务端权威检查点：每个有效动作与事件、状态在同一事务内保存；评分只能来自合法确认动作。
- 服务端场景草稿：保存未确认家具布局、查看位置，不计分、不解锁。独立 draft_revision 与 base_revision 防止覆盖较新状态。
- IndexedDB：持久保存最后权威快照、草稿和待发送动作 outbox。发送前写入原 action_id、完整请求载荷与 expected_revision，写入成功才发送；服务端确认后原子更新快照并清理 outbox。
- 浏览器仅保存会话定位信息，不保存认证秘密。身份通过持久 Secure/HttpOnly/SameSite Cookie，明确 Max-Age/Expires，与服务端存档保留期对齐。匿名 MVP 支持同一浏览器和站点恢复，跨设备恢复后续设计。游戏会话凭据只用于存档访问，不等同于登录或注册功能。最终 ZENEWE 账号关联、登录/注册及数据同步由 George 在部署后迁移整合；本项目不实现平台账号系统。

家具 pointerup、查看目标变化立即保存草稿；拖动中建议每 500ms 本地采样，在线防抖同步服务器。确认前恢复为草稿，不能伪造已完成摆放。后台、竖屏暂停时尽力刷新存档并暂停计时。

显示状态区分“保存中”“已同步”“已保存在此设备，联网后同步”“保存失败”。本地配额/写入失败不得虚报成功；保留内存状态、重试入口与明确提示。突然强杀只能恢复最后持久状态，无法保证尚未落盘的最后一个拖动采样。

## 三类中断

| 情况 | 行为 |
| --- | --- |
| 断网/API 不可达 | 保留当前场景和持久 outbox/草稿，暂停计时与依赖服务器的推进；联网补同步 |
| 关闭页面/强杀 | 下次打开提供继续入口，使用已有检查点和草稿恢复，不依赖最后一刻发请求 |
| 主动保存并退出 | 停止输入，等待本地保存，在线尝试同步；离线可带明确本地保存状态退出；不清除凭据或存档 |

MVP 支持中断恢复，不承诺完整离线游玩。不能仅凭 navigator.onLine 判定接口可用。浏览器关闭事件并不可靠，特别是手机强杀，因此 visibilitychange/pagehide、sendBeacon 或 keepalive 只能辅助保存，不是唯一机制或成功凭证。[MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)

本地存储可能被清理或受限，不能承诺永久保存；Cookie 被清除或无痕会话结束后，匿名身份无法自动找回。具体保留期限上线前确定。[MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

## 恢复协议

1. 通过持久 Cookie 查询本人未完成会话，首页展示继续游戏、关卡、保存时间。sessionId 不是身份凭据。
2. 加载服务器检查点和固定规则版本，先处理 outbox 中结果未知的请求，再恢复相容草稿。
3. 响应丢失的动作必须重用原 action_id；后端先查去重记录，再检查旧 revision。已处理返回原响应；未处理才按当前合法状态执行，不能重复发物品或计分。
4. 草稿 base_revision/scene/schema 相容才恢复；冲突则保留副本、提示采用较新权威进度，不用客户端时间戳覆盖服务器。
5. 每次只允许一个依赖动作待确认；多标签通过 IndexedDB 事务 claim/短租约协调 outbox，后端幂等和 revision 为最终防线。
6. 前台、横屏、资源和网络就绪后恢复活动计时；后台、关闭、断线时间不计入。服务端按最后确认活动区间结算，不相信客户端任意补报时长。
7. 会话已完成则进入旧结果。过期/损坏/无访问权给出明确说明，不悄悄创建新会话覆盖旧进度。旧内容资产与规则版本在存档有效期内保留。

## API 与数据增补

- GET /api/v1/sessions/resumable：Cookie 授权，返回本人未完成存档摘要。静态路由先于 /sessions/{id} 匹配。
- GET /api/v1/sessions/{id}：返回权威 checkpoint、兼容草稿、revision、last_accepted_action_id、updated_at。
- PUT /api/v1/sessions/{id}/draft：draft_id、base_revision、expected_draft_revision、schema_version、白名单 payload；冲突 409。
- scene_drafts 表：session_id、scene_id、base_revision、draft_revision、schema_version、payload、updated_at。
- 草稿接口验证所有权、场景、坐标范围、长度和 schema；禁止修改物品归属、任务完成、分数或规则版本。
- 本地 stores：checkpoints、drafts、outbox；键含 session_id 和 schema_version；提交草稿后以新检查点为准。

George 交接：保持站点 origin 稳定、持久 Cookie 正确、旧资源可读、存档与草稿纳入数据库备份；应用升级不能破坏旧 schema 的读取兼容性。

## 必测验收

1. 四关分别中途关闭再开，继续同一场景、物品和选择。
2. 家具未确认草稿可恢复且不提前计分。
3. 请求发出前断网、事务提交后响应丢失、收到响应前关闭分别验证。
4. 离线保存退出后重进补发，物品与分数只产生一次。
5. 强杀后最后已同步动作不丢失；未落盘采样不宣称已保存。
6. 主动退出、刷新、浏览器前进后退和手机后台回收。
7. 多标签冲突不让旧草稿覆盖新进度。
8. 更新规则后旧存档继续使用原版本。
9. 本地写失败、Cookie/存档过期有明确状态。
10. 断线、旋屏、关闭和后台期间不增加有效寻找时间。
11. 过场或最终结算中关闭，恢复不重复副作用和结果。
