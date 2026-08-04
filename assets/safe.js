/** Escape plain text before placing it in an HTML string. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function safeEventEmoji(event) {
  return escapeHtml(event?.emoji || "🔮");
}
