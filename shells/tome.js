import { esc, attr, list } from '../esc.js?v=0.1.16';
import { candleSvg } from '../candle.js?v=0.1.16';
import { worldOf, spellName } from '../core/worlds.mjs?v=0.1.16';
import { CORNER, RING, BRACKET, STITCH_MOTH, STITCH_LAVENDER, MOTH_ALT, LAVENDER_ALT } from '../glyphs.js?v=0.1.16';

const CHARM_FACES = {
  story: '<path class="cc-cf-ink" d="M22 14c-3.5-2.6-9-2.8-12.5-.8v16.6c3.500-2 9-1.800 12.500.8 3.500-2.600 9-2.800 12.500-.8V13.200C31 11.200 25.500 11.400 22 14z"/><path class="cc-cf-ink" d="M22 14v16.600"/>',
  dice: '<path class="cc-cf-ink" d="M22 7.500l12 7v14.500l-12 7-12-7V14.500z"/><path class="cc-cf-ink" d="M22 13l8.500 15.500h-17zM22 7.500V13M10 14.500l3.500 14M34 14.500l-3.500 14M22 36L13.500 28.500M22 36l8.500-7.500"/>',
};

export function charmHtml(mode) {
  const { dice } = mode;
  const flip = mode.flip ? ` data-flip="1" style="--cc-from:${dice ? '0deg' : '180deg'}"` : '';
  const face = (k) => `<span class="cc-face cc-face-${k}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="cc-cf-disc" cx="22" cy="22" r="20.500"/><circle class="cc-cf-rim" cx="22" cy="22" r="17"/>${CHARM_FACES[k]}</svg></span>`;
  return `<button type="button" class="cc-charm${mode.locked ? ' cc-locked' : ''}" role="switch" aria-checked="${dice}" aria-disabled="${mode.locked}" aria-label="${esc(mode.label)}" title="${esc(mode.title)}" data-act="mode" data-v="${mode.next}">
    <svg class="cc-charm-chain" viewBox="0 0 44 54" aria-hidden="true"><defs><linearGradient id="cc-charm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="cc-st1"/><stop offset=".5" class="cc-st2"/><stop offset="1" class="cc-st3"/></linearGradient></defs><circle class="cc-chain-ring" cx="22" cy="5" r="4"/><ellipse class="cc-chain-link" cx="22" cy="15" rx="3" ry="5"/><ellipse class="cc-chain-link" cx="22" cy="25" rx="5" ry="3"/><ellipse class="cc-chain-link" cx="22" cy="34" rx="3" ry="5"/><ellipse class="cc-chain-link" cx="22" cy="44" rx="5" ry="3"/></svg>
    <span class="cc-coin3d" data-side="${dice ? 'dice' : 'story'}"${flip}>${face('story')}${face('dice')}</span>
    <span class="cc-charm-cap">${esc(mode.cap)}</span>
  </button>`;
}

export function ribbonsHtml(tabs) {
  return `<nav class="cc-ribbons" role="tablist">${tabs.map((t, i) =>
    `<button type="button" role="tab" class="cc-ribbon" data-i="${i}" data-act="tab" data-v="${t.id}" aria-selected="${t.selected}">${esc(t.name)}${t.alerts ? `<span class="cc-dot">${esc(t.alerts)}</span>` : ''}</button>`).join('')}</nav>`;
}

export function candleHtml(t, { mini = false, uid = 'p' } = {}) {
  if (!t) return '';
  return `<div class="cc-candle-box${mini ? ' cc-mini' : ''}" title="${esc(t.title)}">
    ${candleSvg({ level: t.level, forecast: t.forecast, scale: t.cap, temporary: t.marks.temporary, permanent: t.marks.permanent, mini, uid })}
    <span class="cc-candle-n">${esc(t.text)}</span>
    ${mini ? '' : `<span class="cc-candle-cap">${esc(t.word ?? 'напряжение')}</span>`}
  </div>`;
}

export function marksHtml(view, ui) {
  const last = list(view.data?.spells).find((s) => s.id === ui.lastSpellId);
  const onCast = ui.tab === 'cast';
  const resume = last ? `Где остановилась: ${spellName(last, worldOf(view.settings?.skin))}` : 'Здесь появится последнее открытое заклинание';
  return `<div class="cc-marks">
    <button type="button" class="cc-mark cc-mark-a" data-act="resume" aria-label="${esc(resume)}" title="${esc(resume)}" aria-disabled="${!last}"${attr('data-active', Boolean(last && onCast && ui.spellId === last.id))}>${STITCH_MOTH}</button>
    <button type="button" class="cc-mark cc-mark-b" data-act="favshelf" aria-label="Избранное" title="Избранное"${attr('data-active', onCast && !ui.spellId && ui.school === 'fav' && !ui.q)}>${STITCH_LAVENDER}</button>
  </div>`;
}

const tome = (view, inner, { side = '', spread = false, selected = false, layout = 'spread', candle = '', ribbons = '', marks = '' } = {}) => {
  const theme = esc(view?.settings?.skin ?? view?.settings?.theme ?? 'amethyst');
  return `<div class="cc-tome" data-theme="${theme}" data-spread="${spread}" data-selected="${selected}" data-layout="${esc(layout)}">
    ${marks}
    <div class="cc-edges" aria-hidden="true"></div>
    <div class="cc-lavender" aria-hidden="true">${LAVENDER_ALT}</div>
    <div class="cc-corners" aria-hidden="true">${CORNER}${CORNER}${CORNER}${CORNER}</div>
    <div class="cc-spine">${RING}${RING}${RING}</div>
    ${candle ? `<div class="cc-tome-candle">${BRACKET}${candle}</div>` : ''}
    ${ribbons}
    ${inner}
    ${side ? `<div class="cc-side">${side}</div>` : ''}
    <div class="cc-props" aria-hidden="true"><div class="cc-candlelight"></div><div class="cc-moth"><i class="cc-moth-rest"></i><i class="cc-moth-fly"></i>${MOTH_ALT}</div></div>
  </div>`;
};

export const layoutBtn = (ui) => { const c = ui.layout === 'compact'; return `<button type="button" class="cc-layoutbtn" data-act="layout" data-v="${c ? 'spread' : 'compact'}" aria-label="${c ? 'Показать разворот' : 'Компактный режим'}" aria-pressed="${c}">${c ? 'Разворот' : 'Компактно'}</button>`; };

export default {
  id: 'tome',
  layouts: ['spread', 'compact'],
  dragSelector: '.cc-tome',
  noGrab: 'button, input, select, textarea, a, summary, label, [data-act], [contenteditable], .cc-page, .cc-side',
  posKey: 'cena-chuda:pos',
  candleHtml,
  bareHtml: (uid) => `<div class="cc-candle-box cc-mini">${candleSvg({ level: 0, mini: true, uid })}</div>`,
  html({ view, ui, content, parts = null, side = '', selected = false, tension = null, tabs = null, mode = null }) {
    if (parts) {
      content = `<section class="cc-page">
    ${parts.close}${layoutBtn(ui)}
    ${parts.head(charmHtml(mode))}
    ${parts.casting ? `<div class="cc-queue-slot">${parts.queue}</div>` : ''}
    ${parts.toolbar}
    <div class="cc-pagebody">${parts.main}</div>
  </section>`;
    }
    return tome(view, content, {
      side, spread: Boolean(tabs), selected, layout: ui?.layout ?? 'spread',
      candle: tension ? candleHtml(tension) : '', ribbons: tabs ? ribbonsHtml(tabs) : '', marks: tabs ? marksHtml(view, ui) : '',
    });
  },
};
