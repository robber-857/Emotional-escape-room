// Translate failures at the presentation boundary; keep API recovery semantics intact.
export function playerMessage(message: string, fallback = "暂时无法继续，请检查网络后重试。") {
  if (!message) return fallback;
  if (/VERSION_CONFLICT|其他页面|另一标签页|旅程已切换/.test(message)) return "这段旅程已在其他页面更新，请重新载入后继续。";
  if (/SESSION_NOT_FOUND|凭据|没有服务器会话/.test(message)) return "暂时找不到这段旅程，请返回第一幕重新开始。";
  if (/存储|保存失败/.test(message)) return "无法保存这次操作，请检查浏览器是否允许保存进度后重试。";
  if (/[A-Za-z_]|服务器|服务端|回执|校验|事件|响应|配置|记录已满|本机|本地预览/.test(message)) return fallback;
  return message.replaceAll("重试同步", "重试").replaceAll("重新同步", "重新载入").replaceAll("同步最新", "载入最新");
}
