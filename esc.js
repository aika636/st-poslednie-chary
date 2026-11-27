export const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
}[ch]));

export const list = (v) => (Array.isArray(v) ? v : []);
export const attr = (name, on) => (on ? ` ${name}` : '');
