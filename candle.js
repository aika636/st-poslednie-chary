// Свеча — шкала напряжения. Чистая функция: число → SVG-строка (без пользовательского текста).
// Чем выше напряжение, тем ниже воск, длиннее потёки и выше пламя. Надломы — трещины на воске:
// временные — рельефные сколы (тяжесть 3 тлеет), принятые навсегда — золотые швы. Прогноз очереди — пунктирная кромка.
import { SCALE, SCALE_MAX } from './core/rules.mjs?v=0.1.28';

const clampScale = (n) => (Number.isFinite(n) ? Math.max(1, Math.min(SCALE_MAX, Math.round(n))) : SCALE);
const clampLevel = (n, scale) => Math.max(0, Math.min(scale, Number.isFinite(n) ? Math.round(n) : 0));

// Верх воска: от 22 (полная свеча) до 58 (на пределе) равными шагами по числу делений шкалы.
const TOP_FULL = 22;
const TOP_LOW = 58;
const topY = (lv, scale) => +(TOP_FULL + (lv * (TOP_LOW - TOP_FULL)) / scale).toFixed(1);
const BOTTOM_Y = 80;
const LEFT_X = 23;
const RIGHT_X = 41;

// Потёки: [x, длина, снаружи]. Крайние свисают за кромку воска (рисуются под ним), средние лежат на боку.
const DRIPS = [
  [24.2, 8, 1], [39.8, 11, 1], [31, 5, 0], [35, 13, 0], [28, 11, 0],
];

// Неровный край воска: смещение по высоте, детерминированное.
const wob = (y, k) => +(0.5 * Math.sin(y * 0.37 + k) + 0.3 * Math.sin(y * 0.93 + k * 2.1)).toFixed(2);

function waxPath(top) {
  const ys = [];
  for (let y = top + 7; y < BOTTOM_Y - 3; y += 6) ys.push(y);
  const side = (xs, k, dir) => ys.map((y) => `${(xs + dir * wob(y, k)).toFixed(2)} ${y}`);
  const L = side(LEFT_X, 0.4, 1);
  const R = side(RIGHT_X, 2.3, -1);
  let d = `M${LEFT_X} ${top + 3.5} C${LEFT_X - 0.2} ${top - 0.6} ${LEFT_X + 3.5} ${top - 1} ${LEFT_X + 7} ${top - 0.3} S${RIGHT_X - 8} ${top + 1.6} ${RIGHT_X - 4} ${top + 1.3} S${RIGHT_X + 0.3} ${top + 0.8} ${RIGHT_X} ${top + 3.5}`;
  for (const p of R) d += ` L${p}`;
  d += ` L${RIGHT_X} ${BOTTOM_Y} H${LEFT_X}`;
  for (const p of [...L].reverse()) d += ` L${p}`;
  return d + ' Z';
}

// level — «четвертной» уровень 0…4: рисунок потёков, пламени и цвета не зависит от размера шкалы.
function dripPaths(level, top, outer) {
  const n = Math.min(DRIPS.length, level + (level >= 3 ? 1 : 0));
  let out = '';
  for (let i = 0; i < n; i++) {
    const [x, base, edge] = DRIPS[i];
    if (Boolean(edge) !== outer) continue;
    const len = Math.min(BOTTOM_Y - top - 4, base + level * 2);
    out += `<path class="cc-c-drip" d="M${x - 1.7} ${top + 1} v${len} a1.7 1.7 0 0 0 3.4 0 v-${len}"/>`;
  }
  return out;
}

// Трещины: детерминированные формы от края воска [x, y] (y от уровня трещины); чётные — слева, прочие — справа.
const SHAPES = [
  { main: [[21.6, -1], [24.5, .8], [26.2, .2], [28.4, 3.6], [30, 3.2], [32.4, 7.6]], w: 3.0, br: [[[28.4, 3.6], [29.8, 6.4], [29.4, 8.8]], .95, [[24.5, .8], [23.8, 3.8], [24.8, 6]], .85], side: 0 },
  { main: [[21.6, 0], [24.8, .4], [26, 2.6], [29, 2.8], [30.2, 5.8], [33, 6.6]], w: 2.8, br: [[[26, 2.6], [25, 5.4], [26.2, 7.8]], .9], side: 1 },
  { main: [[21.6, -.5], [23.8, 1.4], [25.6, .9], [27.6, 4], [29.6, 4.2], [31.4, 8.2]], w: 2.9, br: [[[27.6, 4], [26.6, 6.6], [27.4, 9]], .9, [[29.6, 4.2], [31.4, 3.6]], .6], side: 0 },
];
const MAX_MARKS = 3;
const fx = (n) => +n.toFixed(2);
const polyline = (pts, dx = 0, dy = 0) => 'M' + pts.map(([x, y]) => `${fx(x + dx)} ${fx(y + dy)}`).join(' L');

// Заливка-полигон вдоль ломаной: ширина w0 в начале сужается к концу.
function taper(pts, w0, p) {
  const n = pts.length;
  const seg = (i) => Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let len = 0;
  for (let i = 1; i < n; i++) len += seg(i);
  const L = [], R = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i) acc += seg(i);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = (b[0] - a[0]) / d, dy = (b[1] - a[1]) / d;
    const w = (w0 / 2) * Math.pow(Math.max(0, 1 - acc / len), p);
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  return polyline([...L, ...R.reverse()]) + ' Z';
}

function crackGeom(i, s) {
  const sh = SHAPES[i % SHAPES.length];
  const x0 = sh.main[0][0];
  const tr = (pts) => pts.map(([x, y]) => [sh.side ? 64 - (x0 + (x - x0) * s) : x0 + (x - x0) * s, y * s]);
  const branches = [];
  for (let k = 0; k < sh.br.length; k += 2) branches.push({ pts: tr(sh.br[k]), w: sh.br[k + 1] * s });
  return { main: tr(sh.main), w: sh.w * s, branches };
}

// Обычный надлом: тень, тёмное тело, блик по кромке; тяжесть 3 — тлеющий свет внутри; принятый — золотой шов.
function crackMarkup(g, kind, severity) {
  const all = [{ pts: g.main, w: g.w }, ...g.branches];
  if (kind === 'seam') {
    const sm = [{ pts: g.main, w: g.w * 1.15 }, ...g.branches];
    return `<g class="cc-c-seam">${sm.map((b) => `<path class="cc-k-seam" d="${taper(b.pts, b.w, .8)}"/>`).join('')}${sm.map((b) => `<path class="cc-k-seam-lit" d="${polyline(b.pts, -.1, -b.w * .25)}"/>`).join('')}</g>`;
  }
  let out = `<g class="cc-c-crack" data-sev="${severity}">`;
  for (const b of all) out += `<path class="cc-k-shade" stroke-width="${fx(b.w + .3)}" d="${polyline(b.pts, 0, .35)}"/>`;
  for (const b of all) out += `<path class="cc-k-body" d="${taper(b.pts, b.w, .8)}"/>`;
  for (const b of all) out += `<path class="cc-k-lit" d="${polyline(b.pts, .1, b.w * .3 + .3)}"/>`;
  if (severity >= 3) {
    const cut = g.main.slice(0, 5);
    out += `<g class="cc-k-ember"><path class="cc-k-halo" filter="url(#BLUR)" d="${polyline(cut)}"/><path class="cc-k-core" d="${polyline(cut)}"/>`;
    if (g.branches[0]) out += `<path class="cc-k-core cc-k-core-thin" d="${polyline(g.branches[0].pts.slice(0, 2))}"/>`;
    out += '</g>';
  }
  return out + '</g>';
}

// marks: [{ kind: 'crack' | 'seam', severity }], не больше трёх; обрезка по форме воска.
function crackPaths(top, marks, waxD, id) {
  const list = marks.slice(0, MAX_MARKS);
  if (!list.length) return '';
  const height = BOTTOM_Y - top;
  const s = Math.min(1.15, Math.max(.65, height / 30));
  const clip = id('clip');
  const blur = id('blur');
  let out = `<defs><clipPath id="${clip}"><path d="${waxD}"/></clipPath><filter id="${blur}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".6"/></filter></defs><g clip-path="url(#${clip})">`;
  list.forEach((m, i) => {
    const y = top + 2 + ((i + 1) * height) / (list.length + 2);
    out += `<g transform="translate(0 ${y.toFixed(1)})">${crackMarkup(crackGeom(i, s), m.kind, m.severity).replace('#BLUR', `#${blur}`)}</g>`;
  });
  return out + '</g>';
}

// level — текущее напряжение (со всеми надломами), forecast — после очереди.
// marks — надломы свечи: [{ kind: 'crack' | 'seam', severity }].
export function candleSvg({ level = 0, forecast = null, scale = SCALE, marks = [], mini = false, uid = 'm' } = {}) {
  const id = (n) => `cc-${n}-${String(uid).replace(/[^a-z0-9]/gi, '')}`;
  const cap = clampScale(scale);
  const lv = clampLevel(level, cap);
  const heat = Math.round((lv * 4) / cap);
  const top = topY(lv, cap);
  const fc = forecast === null || forecast === undefined ? null : clampLevel(forecast, cap);
  const flameScale = (1 + heat * 0.16).toFixed(2);
  const ghost = fc !== null && fc !== lv
    ? `<path class="cc-c-ghost" d="M${LEFT_X} ${topY(fc, cap)} H${RIGHT_X}"/>`
    : '';
  const label = `Напряжение ${lv} из ${cap}${fc !== null && fc !== lv ? `, после очереди ${fc}` : ''}`;
  const holder = mini ? '' : `
    <path class="cc-c-moon" fill="url(#${id('gold')})" d="M16 86 C2 70 4 40 22 26 C12 44 13 66 26 84 Z"/>
    <path class="cc-c-moon-edge" d="M19.5 30.5 C11 44 11.5 66 22 81"/>
    <circle class="cc-c-moon-tip" cx="22" cy="26" r="2"/>`;
  const gem = mini ? '' : `
    <ellipse class="cc-c-dish-rim" cx="32" cy="88.6" rx="19" ry="2.4"/>
    <circle class="cc-c-gem" cx="32" cy="88.4" r="2.6" fill="url(#${id('gem')})"/>`;
  return `<svg class="cc-candle${mini ? ' cc-candle-mini' : ''}" data-level="${lv}" data-scale="${cap}" data-heat="${heat}" viewBox="0 0 64 96" role="img" aria-label="${label}">
    <title>${label}</title>
    <defs>
      <radialGradient id="${id('glow')}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="var(--cc-flame-glow)" stop-opacity=".55"/><stop offset="1" stop-color="var(--cc-flame-glow)" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id('wax')}" x1="0" x2="1"><stop offset="0" stop-color="var(--cc-wax-shade)"/><stop offset=".45" stop-color="var(--cc-wax)"/><stop offset="1" stop-color="var(--cc-wax-shade)"/></linearGradient>
      <linearGradient id="${id('gold')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#d9a948"/><stop offset="1" stop-color="#7a5219"/></linearGradient>
      <radialGradient id="${id('gem')}" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#d8fffb"/><stop offset=".45" stop-color="#3fd3c8"/><stop offset="1" stop-color="#11635e"/></radialGradient>
      <linearGradient id="${id('flame')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--cc-flame-base)"/><stop offset=".55" stop-color="var(--cc-flame)"/><stop offset="1" stop-color="var(--cc-flame-tip)"/></linearGradient>
    </defs>
    ${holder}
    <ellipse class="cc-c-dish" cx="32" cy="86" rx="21" ry="5"/>
    <ellipse class="cc-c-dish-top" cx="32" cy="83.5" rx="16" ry="3.2"/>${gem}
    ${lv >= cap ? '<ellipse class="cc-c-puddle" cx="32" cy="82" rx="12" ry="2.4"/>' : ''}
    <circle class="cc-c-glow" cx="32" cy="${top - 9}" r="${(12 + heat * 3).toFixed(0)}" fill="url(#${id('glow')})"/>
    ${dripPaths(heat, top, true)}
    <path class="cc-c-wax" fill="url(#${id('wax')})" d="${waxPath(top)}"/>
    ${dripPaths(heat, top, false)}
    <ellipse class="cc-c-pool" cx="32" cy="${top + 1.2}" rx="9" ry="2.3"/>
    <ellipse class="cc-c-pool-in" cx="32" cy="${top + 1.5}" rx="5.2" ry="1.3"/>
    <path class="cc-c-pool-lip" d="M24.4 ${top + 1.4} Q32 ${top + 4.6} 39.6 ${top + 1.4}"/>
    <path class="cc-c-fall" style="--cc-fall:${BOTTOM_Y - top - 12}px" d="M38.4 ${top + 2} c1.3 2.2 1.8 3.2 1.8 4.2 a1.8 1.8 0 0 1 -3.6 0 c0 -1 .5 -2 1.8 -4.2z"/>
    ${crackPaths(top, marks, waxPath(top), id)}
    ${ghost}
    <path class="cc-c-wick" d="M32 ${top} v-4"/>
    <g class="cc-c-flame" style="transform-origin: 32px ${top - 3}px; --cc-flame-scale: ${flameScale}">
      <path fill="url(#${id('flame')})" d="M32 ${top - 16} C36 ${top - 10} 37 ${top - 6} 32 ${top - 3} C27 ${top - 6} 28 ${top - 10} 32 ${top - 16} Z"/>
      <path class="cc-c-core" d="M32 ${top - 10} C33.6 ${top - 7.5} 33.6 ${top - 5} 32 ${top - 4} C30.4 ${top - 5} 30.4 ${top - 7.5} 32 ${top - 10} Z"/>
    </g>
  </svg>`;
}

// Отметины свечи: золотые швы — постоянные свойства от принятых надломов (всегда тяжесть 3),
// затем трещины по текущим надломам с их тяжестью.
export function candleMarks(state) {
  const traits = Array.isArray(state?.profile?.traits) ? state.profile.traits.filter((t) => t?.fractureId) : [];
  const fractures = Array.isArray(state?.fractures) ? state.fractures : [];
  return [
    ...traits.map(() => ({ kind: 'seam', severity: 3 })),
    ...fractures.map((f) => ({ kind: 'crack', severity: Math.min(3, Math.max(1, Number(f?.severity) || 1)) })),
  ];
}

// Напряжение выросло по сравнению с прошлой отрисовкой (первая отрисовка и смена чата — null).
export const castFxKind = (openId, spellId) => (openId && openId === spellId ? 'leaf' : 'row');
export const levelGrew = (prev, next) => Number.isFinite(prev) && Number.isFinite(next) && next > prev;

// Короткий эффект переживает перерисовку innerHTML: класс вешается на уже прошедшую долю анимации
// и снимается по её окончанию. at — время старта (мс), ms — длительность, endName — последняя анимация.
export function playFx(el, cls, at, ms, endName, now = Date.now()) {
  if (!el || !at) return false;
  const age = now - at;
  if (age < 0 || age >= ms) return false;
  el.style.setProperty('--cc-fx-delay', `-${Math.round(age)}ms`);
  el.classList.add(cls);
  const done = (e) => {
    if (e.animationName !== endName) return;
    el.classList.remove(cls);
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
  return true;
}
