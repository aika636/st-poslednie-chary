// Подсказка каста по тексту поста: ищет в тексте названия заклинаний с учётом падежей.
// Только предлагает — каст ставит в очередь сам игрок нажатием на подсказку.
const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Основа слова: окончание отбрасывается, чтобы «Незримая ладонь» нашлась и в «незримой ладонью».
export function stem(word) {
  const w = norm(word);
  if (w.length >= 6) return w.slice(0, -2);
  if (w.length >= 5) return w.slice(0, -1);
  return w;
}

// Однословные названия и названия, начинающиеся с короткого служебного слова («До поры», «На грани»), ловятся только с заглавной.
export function matcherFor(spell) {
  const words = norm(spell?.name).match(/\p{L}+/gu) ?? [];
  if (!words.length) return null;
  const body = words.map((w) => `${escRe(stem(w))}\\p{L}*`).join('[\\s,—–-]+');
  return { id: spell.id, name: spell.name, size: words.join(' ').length, cap: words.length === 1 || words[0].length <= 3, re: new RegExp(`(?<!\\p{L})${body}(?!\\p{L})`, 'u') };
}

export function buildMatchers(spells) {
  return (Array.isArray(spells) ? spells : []).map(matcherFor).filter(Boolean)
    // Длинные названия проверяются первыми: «Великий морок» важнее «Малого морока».
    .sort((a, b) => b.size - a.size);
}

// Первое (самое длинное) найденное заклинание, кроме исключённых (уже в очереди, отклонённые).
export function findSpell(text, matchers, exclude = new Set()) {
  const t = norm(text);
  if (t.trim().length < 3) return null;
  for (const m of matchers) {
    if (exclude.has(m.id)) continue;
    const hit = m.re.exec(t);
    if (!hit) continue;
    const ch = String(text)[hit.index];
    if (m.cap && (!ch || ch === ch.toLowerCase())) continue;
    return { id: m.id, name: m.name };
  }
  return null;
}
