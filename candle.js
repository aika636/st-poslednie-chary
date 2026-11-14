// Свеча — шкала напряжения. Чистая функция: число → SVG-строка (без пользовательского текста).
// Чем выше напряжение, тем ниже воск, длиннее потёки и выше пламя. Надломы — трещины на воске:
// временные тёмные, принятые навсегда — золотые швы. Прогноз очереди — пунктирная кромка.
import { SCALE } from './core/rules.mjs?v=0.1.4';

const clampLevel = (n) => Math.max(0, Math.min(SCALE, Number.isFinite(n) ? Math.round(n) : 0));

const TOP_Y = [22, 31, 40, 49, 58]; // верх воска по уровню 0…4
const BOTTOM_Y = 80;
const LEFT_X = 23;
const RIGHT_X = 41;

// Потёки: [x, длина] — с ростом уровня добавляются и удлиняются.
const DRIPS = [
  [26, 6], [38, 9], [31, 5], [35, 13], [28, 11],
];

function dripPaths(level, top) {
  const n = Math.min(DRIPS.length, level + (level >= 3 ? 1 : 0));
  let out = '';
  for (let i = 0; i < n; i++) {
    const [x, base] = DRIPS[i];
    const len = Math.min(BOTTOM_Y - top - 3, base + level * 2);
    out += `<path class="cc-c-drip" d="M${x - 1.6} ${top + 1} v${len} a1.6 1.6 0 0 0 3.2 0 v-${len} z"/>`;
  }
  return out;
}

// Трещины: детерминированные ломаные, чтобы не «прыгали» при перерисовке.
const CRACKS = [
  'M24 0 l4 3 l-2 3 l5 2',
  'M40 0 l-4 2 l2 4 l-5 3',
  'M25 0 l5 4 l-1 3 l4 2',
];

function crackPaths(top, temporary, permanent) {
  const height = BOTTOM_Y - top;
  const rows = [];
  const total = Math.min(CRACKS.length, temporary + permanent);
  for (let i = 0; i < total; i++) {
    const y = top + 6 + ((i + 1) * height) / (total + 2);
    const cls = i < permanent ? 'cc-c-seam' : 'cc-c-crack';
    rows.push(`<path class="${cls}" transform="translate(0 ${y.toFixed(1)})" d="${CRACKS[i]}"/>`);
  }
  return rows.join('');
}

// level — текущее напряжение (со всеми надломами), forecast — после очереди.
// temporary / permanent — сколько трещин и золотых швов рисовать.
export function candleSvg({ level = 0, forecast = null, temporary = 0, permanent = 0, mini = false, uid = 'm' } = {}) {
  const id = (n) => `cc-${n}-${String(uid).replace(/[^a-z0-9]/gi, '')}`;
  const lv = clampLevel(level);
  const top = TOP_Y[lv];
  const fc = forecast === null || forecast === undefined ? null : clampLevel(forecast);
  const flameScale = (1 + lv * 0.16).toFixed(2);
  const ghost = fc !== null && fc !== lv
    ? `<path class="cc-c-ghost" d="M${LEFT_X} ${TOP_Y[fc]} H${RIGHT_X}"/>`
    : '';
  const label = `Напряжение ${lv} из ${SCALE}${fc !== null && fc !== lv ? `, после очереди ${fc}` : ''}`;
  const holder = mini ? '' : `
    <path class="cc-c-moon" fill="url(#${id('gold')})" d="M16 86 C2 70 4 40 22 26 C12 44 13 66 26 84 Z"/>
    <path class="cc-c-moon-edge" d="M19.5 30.5 C11 44 11.5 66 22 81"/>
    <circle class="cc-c-moon-tip" cx="22" cy="26" r="2"/>`;
  const gem = mini ? '' : `
    <ellipse class="cc-c-dish-rim" cx="32" cy="88.6" rx="19" ry="2.4"/>
    <circle class="cc-c-gem" cx="32" cy="88.4" r="2.6" fill="url(#${id('gem')})"/>`;
  return `<svg class="cc-candle${mini ? ' cc-candle-mini' : ''}" data-level="${lv}" viewBox="0 0 64 96" role="img" aria-label="${label}">
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
    ${lv >= 4 ? '<ellipse class="cc-c-puddle" cx="32" cy="82" rx="12" ry="2.4"/>' : ''}
    <circle class="cc-c-glow" cx="32" cy="${top - 9}" r="${(12 + lv * 3).toFixed(0)}" fill="url(#${id('glow')})"/>
    <path class="cc-c-wax" fill="url(#${id('wax')})" d="M${LEFT_X} ${top + 2} Q${LEFT_X} ${top} ${LEFT_X + 3} ${top} H${RIGHT_X - 3} Q${RIGHT_X} ${top} ${RIGHT_X} ${top + 2} V${BOTTOM_Y} H${LEFT_X} Z"/>
    <ellipse class="cc-c-pool" cx="32" cy="${top + 1}" rx="8" ry="1.6"/>
    ${dripPaths(lv, top)}
    ${crackPaths(top, temporary, permanent)}
    ${ghost}
    <path class="cc-c-wick" d="M32 ${top} v-4"/>
    <g class="cc-c-flame" style="transform-origin: 32px ${top - 3}px; --cc-flame-scale: ${flameScale}">
      <path fill="url(#${id('flame')})" d="M32 ${top - 16} C36 ${top - 10} 37 ${top - 6} 32 ${top - 3} C27 ${top - 6} 28 ${top - 10} 32 ${top - 16} Z"/>
      <path class="cc-c-core" d="M32 ${top - 10} C33.6 ${top - 7.5} 33.6 ${top - 5} 32 ${top - 4} C30.4 ${top - 5} 30.4 ${top - 7.5} 32 ${top - 10} Z"/>
    </g>
  </svg>`;
}

// Сколько трещин рисовать: временные — по числу надломов, золотые — по постоянным свойствам
// от принятых надломов.
export function candleMarks(state) {
  const fractures = Array.isArray(state?.fractures) ? state.fractures.length : 0;
  const traits = Array.isArray(state?.profile?.traits) ? state.profile.traits.filter((t) => t?.fractureId).length : 0;
  return { temporary: fractures, permanent: traits };
}
