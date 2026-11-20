import { esc } from '../esc.js?v=0.1.15';

const R = 48;
const GAP = 7;
const pt = (a, r = R) => { const g = (a * Math.PI) / 180; return [60 + r * Math.cos(g), 60 + r * Math.sin(g)]; };
const arc = (a0, a1, r = R) => {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// Кольцо-циферблат: деления одной толщины и с одинаковыми зазорами; метки надломов стоят в зазорах.
export function dialSvg(t, { mini = false } = {}) {
  const n = t.cap;
  const seg = 360 / n;
  const fc = Math.min(t.forecast, n);
  const len = ((R * (seg - GAP)) * Math.PI) / 180;
  const dash = (len / 5).toFixed(2);
  let track = '';
  let fill = '';
  for (let i = 0; i < n; i += 1) {
    const d = arc(-90 + i * seg + GAP / 2, -90 + (i + 1) * seg - GAP / 2);
    track += `<path class="cc-ds cc-ds-off" d="${d}"/>`;
    if (i < t.level) fill += `<path class="cc-ds cc-ds-on" d="${d}"/>`;
    else if (i < fc) fill += `<path class="cc-ds cc-ds-fc" d="${d}" stroke-dasharray="${dash} ${dash}"/>`;
  }
  const over = t.forecast > n ? `<circle class="cc-dial-over" cx="60" cy="60" r="${R + 9}"/>` : '';
  let marks = '';
  const slots = mini ? 0 : Math.min(n, t.marks.permanent + t.marks.temporary);
  for (let j = 0; j < slots; j += 1) {
    const ang = -90 + ((j + 1) % n) * seg;
    const [x, y] = pt(ang);
    const rot = `transform="rotate(${(ang + 90).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"`;
    const [a, b] = [(x).toFixed(2), (y - 7).toFixed(2)];
    const c = (y + 7).toFixed(2);
    if (j < t.marks.permanent) marks += `<g class="cc-dm-perm" ${rot}><path class="cc-dm-under" d="M${a} ${b}V${c}"/><circle class="cc-dm-under" cx="${a}" cy="${b}" r="3"/><circle class="cc-dm-under" cx="${a}" cy="${c}" r="3"/><path class="cc-dm-seam" d="M${a} ${b}V${c}"/><path class="cc-dm-glint" d="M${a} ${b}V${c}"/><circle cx="${a}" cy="${b}" r="1.7"/><circle cx="${a}" cy="${c}" r="1.7"/></g>`;
    else {
      const crack = `M${(x - 0.8).toFixed(2)} ${b}L${(x + 0.8).toFixed(2)} ${(y - 3).toFixed(2)}L${(x - 0.8).toFixed(2)} ${(y + 1).toFixed(2)}L${(x + 0.8).toFixed(2)} ${(y + 4).toFixed(2)}L${a} ${c}`;
      marks += `<g class="cc-dm-temp" ${rot}><path class="cc-dm-under" d="${crack}"/><path d="${crack}"/></g>`;
    }
  }
  return `<svg class="cc-dial-svg" viewBox="0 0 120 120" role="img" aria-label="${esc(t.title)}" focusable="false"><title>${esc(t.title)}</title>${track}${fill}${over}${marks}</svg>`;
}

export function dialHtml(t) {
  const fc = Math.min(t.forecast, t.cap);
  const next = t.forecast > t.level
    ? `<em>→ ${esc(fc)}/${esc(t.cap)}</em><small>${t.forecast > t.cap ? 'перегруз' : t.cast ? 'после каста' : 'после очереди'}</small>`
    : '<small>напряжение</small>';
  return `<div class="cc-candle-box cc-dial" title="${esc(t.title)}" data-over="${t.forecast > t.cap}">${dialSvg(t)}<div class="cc-dial-c"><b>${esc(t.level)}/${esc(t.cap)}</b>${next}</div></div>`;
}

// Кнопка у поля ввода: то же кольцо без меток и с числом в углу.
export function candleHtml(t, { mini = false } = {}) {
  if (!t) return '';
  if (!mini) return dialHtml(t);
  return `<div class="cc-candle-box cc-mini cc-dial" title="${esc(t.title)}">${dialSvg(t, { mini: true })}<span class="cc-candle-n">${esc(t.text)}</span></div>`;
}

const bareHtml = () => `<div class="cc-candle-box cc-mini cc-dial">${dialSvg({ cap: 4, level: 0, forecast: 0, title: '', marks: { permanent: 0, temporary: 0 } }, { mini: true })}</div>`;

const MODES = [['story', 'Сюжет'], ['dice', 'Кубик']];

const modeHtml = (mode) => `<div class="cc-pmode" role="group" aria-label="Режим" title="${esc(mode.title)}">${MODES.map(([id, name]) =>
  `<button type="button" data-act="mode" data-v="${id}" aria-pressed="${mode.id === id}" aria-disabled="${mode.locked}">${name}</button>`).join('')}</div>`;

const tabsHtml = (tabs) => `<nav class="cc-ptabs" role="tablist">${tabs.map((t, i) =>
  `<button type="button" role="tab" class="cc-ptab" data-i="${i}" data-act="tab" data-v="${t.id}" aria-selected="${t.selected}">${esc(t.name)}${t.alerts ? `<span class="cc-dot">${esc(t.alerts)}</span>` : ''}</button>`).join('')}</nav>`;

const lastHtml = (last, open) => `<button type="button" class="cc-tick" data-act="peek" aria-expanded="${open}">${last.alerts ? '<i aria-hidden="true"></i>' : ''}<span>${esc(last.text)}</span><b aria-hidden="true">${open ? '▴' : '▾'}</b></button>${open
  ? `<div class="cc-peek">${last.items.map((i) => `<div${i.bad ? ' class="cc-bad-text"' : ''}>${esc(i.text)}</div>`).join('')}</div>` : ''}`;

export default {
  id: 'phone',
  narrow: '(max-width: 600px)',
  layouts: [],
  posKey: 'cena-chuda:pos-phone',
  dragSelector: '.cc-phone',
  noGrab: 'button, input, select, textarea, a, summary, label, [data-act], [contenteditable], .cc-pview, .cc-pqueue, .cc-peek',
  candleHtml,
  bareHtml,
  html({ view, content, parts = null, tension = null, tabs = null, mode = null }) {
    const src = esc(parts?.who?.source ?? view?.state?.profile?.source ?? '');
    if (!parts) return `<div class="cc-phone" data-src="${src}"><div class="cc-pscreen"><div class="cc-pbar"><span class="cc-pgrip"></span></div><div class="cc-pview cc-pblank">${content}</div></div></div>`;
    const w = parts.who;
    const body = parts.spell
      ? `${parts.toolbar}<div class="cc-pleaf">${parts.side}</div>`
      : `<div class="cc-pagebody">${parts.main}</div>`;
    return `<div class="cc-phone" data-src="${src}" data-selected="${parts.spell}" data-queue="${Boolean(parts.casting && parts.queue)}"><div class="cc-pscreen">
    <div class="cc-pbar"><span class="cc-pgrip"></span>${parts.close}</div>
    <header class="cc-ptop">
      ${tension ? dialHtml(tension) : ''}
      <div class="cc-pwho">
        <b class="cc-pname">${esc(w.name)}</b>
        <span class="cc-pill cc-src" data-src="${src}">${w.glyph}<b>${esc(w.sourceName)}</b></span>
        ${mode ? modeHtml(mode) : ''}
        <div class="cc-flags">${w.flags.join('')}</div>
      </div>
    </header>
    ${lastHtml(parts.last, parts.peekOpen)}
    ${tabs ? tabsHtml(tabs) : ''}
    <div class="cc-pview">${body}</div>
    ${parts.casting && parts.queue ? `<div class="cc-pqueue">${parts.queueOpen ? parts.queue : ''}${parts.queueFold}</div>` : ''}
  </div></div>`;
  },
};
