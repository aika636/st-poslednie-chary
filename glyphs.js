// Знаки: пять источников и шесть направлений магии. Только константная разметка SVG, без
// пользовательского текста. Цвет — currentColor и переменные темы.
import { SPELL_ICONS } from './spell-icons/index.js?v=0.1.28';

const svg = (body, cls = '') => `<svg class="cc-glyph ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const SOURCE_GLYPH = {
  // знание — открытый глаз в треугольнике формулы
  knowledge: svg('<path d="M12 3.5 21 19H3z" class="cc-g-line"/><path d="M6.6 14.2c3-3.6 7.8-3.6 10.8 0-3 3.6-7.8 3.6-10.8 0z" class="cc-g-line"/><circle cx="12" cy="14.2" r="1.7" class="cc-g-fill"/>'),
  // кровь — капля с биением
  blood: svg('<path d="M12 3c3.6 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.4-6.4 6-11z" class="cc-g-line"/><path d="M8.2 14.4h2l1-2 1.6 4 1-2h2" class="cc-g-line"/>'),
  // вера — лучевой знак
  faith: svg('<circle cx="12" cy="12" r="3.2" class="cc-g-fill"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8" class="cc-g-line"/>'),
  // договор — сцепленные скобы
  pact: svg('<path d="M9.5 6H6.5a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h3M14.5 6h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-3" class="cc-g-line"/><path d="M8 12h8" class="cc-g-line"/><circle cx="12" cy="12" r="1.5" class="cc-g-fill"/>'),
  // природа — побег
  nature: svg('<path d="M12 21v-9" class="cc-g-line"/><path d="M12 13c-4.5 0-7-2.6-7-7 4.6 0 7 2.4 7 7zM12 11c0-4.6 2.6-7.5 7-7.5 0 4.6-2.6 7.5-7 7.5z" class="cc-g-line"/>'),
};

export const DIRECTION_GLYPH = {
  // вещество и стихии — пламя
  matter: svg('<path d="M12 3c1 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4 2.4-5.2.3 1.8 1 2.8 2.1 3.3C10.8 8.4 11 5.6 12 3z" class="cc-g-line"/>'),
  // тело и жизнь — ладонь с сердцем
  body: svg('<path d="M12 20s-7-4.3-7-9.5A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.5C19 15.7 12 20 12 20z" class="cc-g-line"/><path d="M8.5 12.5h2l1-1.6 1.4 3 1-1.4h1.6" class="cc-g-line"/>'),
  // чувства и разум — волны мысли
  mind: svg('<circle cx="12" cy="12" r="2.2" class="cc-g-fill"/><path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4" class="cc-g-line"/>'),
  // образы и сокрытие — маска
  images: svg('<path d="M3.5 7.5c5-2 12-2 17 0 0 6-3.4 10-8.5 10S3.5 13.5 3.5 7.5z" class="cc-g-line"/><path d="M7.2 10.4c1-.8 2.4-.8 3.4 0M13.4 10.4c1-.8 2.4-.8 3.4 0" class="cc-g-line"/>'),
  // связи и духи — узел нити
  bonds: svg('<path d="M4 16c3 0 4-8 8-8s5 8 8 8M4 8c3 0 4 8 8 8s5-8 8-8" class="cc-g-line"/>'),
  // границы и перемещение — арка с шагом
  bounds: svg('<path d="M6 21V10a6 6 0 0 1 12 0v11" class="cc-g-line"/><path d="M10 15h6m-2.5-2.5L16 15l-2.5 2.5" class="cc-g-line"/>'),
  // влечение — сердце с язычком пламени над ним
  desire: svg('<path d="M12 21.5S3.5 16.5 3.5 11A4.2 4.2 0 0 1 12 10.5 4.2 4.2 0 0 1 20.5 11c0 5.5-8.5 10.5-8.5 10.5z" class="cc-g-line"/><path d="M12 9.5c-2.4-1-3-3.5-1.6-6.5.4 1.5 1.2 2.2 2.1 2.6.1-.8 0-1.6-.3-2.2 2.4 1.8 2.4 4.9-.2 6.1z" class="cc-g-fill"/>'),
};

export const STAR = svg('<path d="M12 3.2l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.6-4.1 6.1-.6z" class="cc-g-line"/>', 'cc-star-g');

// Кольцо корешка: толстое литое кольцо продето в люверс на корешке и огибает край обложки.
// Ось x=34 совпадает с левым краем тома. Нижняя дуга от люверса до края уходит под обложку
// и не рисуется. Объём трубки — стопка смещённых обводок, без фильтров.
// Кольцо переплёта (вид сверху-спереди, 1 px = 1 единица): выходит из механизма на корешке
// (x=27), дугой огибает край блока и входит в люверс на левом поле страницы (x=96).
// Край блока страниц — x=60: задняя половина дуги правее него скрыта за листами.
const RING_FRONT = 'M96 34A34.5 24 0 0 1 27 34';
const RING_BACK = 'M96 34A34.5 24 0 0 0 27 34';
const tube = (d, cls = '') => `<g class="${cls}"><path d="${d}" class="cc-ring-shadow" transform="translate(1.5 2.6)"/>
  <path d="${d}" class="cc-ring-rim"/>
  <path d="${d}" class="cc-ring-body"/>
  <path d="${d}" class="cc-ring-bounce" transform="translate(1.4 2)"/>
  <path d="${d}" class="cc-ring-shine" transform="translate(-1.2 -1.8)"/></g>`;
const rivet = (x, y) => `<g class="cc-rivet" transform="translate(${x} ${y})">
  <circle r="3.2" class="cc-rivet-base"/>
  <path d="M0-2.6.8-.8 2.6 0 .8.8 0 2.6-.8.8-2.6 0-.8-.8Z" class="cc-rivet-facet"/>
  <circle cx="-.9" cy="-1" r=".7" class="cc-rivet-glint"/>
</g>`;

export const RING = `<svg class="cc-ring" viewBox="0 0 150 70" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="cc-ring-gold" gradientUnits="userSpaceOnUse" x1="30" y1="8" x2="84" y2="62"><stop offset="0" stop-color="#b79c63"/><stop offset=".35" stop-color="#a8863f"/><stop offset=".7" stop-color="#85632a"/><stop offset="1" stop-color="#5a3f18"/></linearGradient>
    <linearGradient id="cc-ring-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d7d80"/><stop offset=".5" stop-color="#5f5f64"/><stop offset="1" stop-color="#3e3e43"/></linearGradient>
    <radialGradient id="cc-ring-pit" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#05010c"/><stop offset=".7" stop-color="#2a1a14"/><stop offset="1" stop-color="#5a4630"/></radialGradient>
    <clipPath id="cc-ring-behind"><rect x="0" y="0" width="60" height="70"/></clipPath>
  </defs>
  <g clip-path="url(#cc-ring-behind)">${tube(RING_BACK, 'cc-ring-back')}</g>
  <ellipse cx="96" cy="34" rx="9.5" ry="7.2" class="cc-ring-eyelet"/>
  <ellipse cx="96" cy="34.6" rx="6.2" ry="4.4" class="cc-ring-hole"/>
  ${tube(RING_FRONT)}
  <path d="M87.6 37A9.5 7.2 0 0 0 104.4 37" class="cc-ring-lip"/>
  <rect x="17" y="22" width="20" height="24" rx="4" class="cc-ring-plate-shadow" transform="translate(1.2 1.6)"/>
  <rect x="17" y="22" width="20" height="24" rx="4" class="cc-ring-plate"/>
  <rect x="19.2" y="24.2" width="15.6" height="19.6" rx="2.6" class="cc-ring-plate-inset"/>
  ${rivet(27, 28.5)}${rivet(27, 39.5)}
</svg>`;

// Уголок обложки (рисуется для верхнего левого угла, остальные — зеркалом в CSS).
export const CORNER = `<svg class="cc-corner" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
  <path d="M6 1h29l-4 9H15a5 5 0 0 0-5 5v16l-9 4V6Z" class="cc-corner-shadow" transform="translate(1 1.5)"/>
  <path d="M6 1h29l-4 9H15a5 5 0 0 0-5 5v16l-9 4V6Z" class="cc-corner-plate"/>
  <path d="M7.5 3.2h23.4l-2.2 4.8H15a7 7 0 0 0-7 7v13.6l-4.8 2.1V7.4Z" class="cc-corner-inset"/>
  <path d="M22 3.6l.9 1.8 1.8.3-1.3 1.2.3 1.9-1.7-.9-1.7.9.3-1.9-1.3-1.2 1.8-.3Z" class="cc-corner-star cc-cx-def"/>
  <path d="M21 4l3 3-3 3-3-3Z" class="cc-corner-star cc-cx cc-cx-dark"/>
  <path d="M19 9.500c0-3 2.500-5 5.500-5-.2 3-2.200 5-5.500 5ZM19 9.500l-2.500 2.500" class="cc-corner-star cc-cx cc-cx-forest"/>
  <path d="M21.500 3.500v7M18 7h7M19 4.500l5 5M24 4.500l-5 5" class="cc-corner-inset cc-cx cc-cx-temple"/>
  <circle cx="6.6" cy="6.6" r="3.3" class="cc-corner-rivet"/>
  <circle cx="5.8" cy="5.8" r=".9" class="cc-corner-glint"/>
</svg>`;

// Кронштейн подсвечника: пластина на поле обложки, литое плечо держит чашу свечи.
export const BRACKET = `<svg class="cc-bracket" viewBox="0 0 60 70" aria-hidden="true" focusable="false">
  <path d="M-2 22C-3 40 10 48 26 46H39" class="cc-bracket-arm-shadow" transform="translate(1.2 1.8)"/>
  <path d="M-2 22C-3 40 10 48 26 46H39" class="cc-bracket-arm"/>
  <path d="M3 37c-7 2-8 11-2 12.5 3.5.8 5.5-2.2 4-4.4" class="cc-bracket-curl"/>
  <path d="M-2.7 23c-.6 9 2.6 15.8 8.2 19.4" class="cc-bracket-shine"/>
  <path d="M39 30h14l3 3v26l-3 3H39l-3-3V33Z" class="cc-bracket-plate"/>
  <circle cx="46" cy="36" r="2.6" class="cc-bracket-rivet"/>
  <circle cx="46" cy="56" r="2.6" class="cc-bracket-rivet"/>
</svg>`;

const spellGlyphs = new Map();
// Знак чары: по id из spell-icons, иначе знак школы; свои чары — знак школы или стихий.
export const glyphFor = (spell) => {
  const body = SPELL_ICONS[spell?.id];
  if (!body) return DIRECTION_GLYPH[spell?.direction] ?? DIRECTION_GLYPH.matter;
  if (!spellGlyphs.has(spell.id)) spellGlyphs.set(spell.id, svg(body));
  return spellGlyphs.get(spell.id);
};

// Вышивка на декоративных закладках сверху: полумесяц со звездой и веточка лаванды, стежки одной нитью.
export const STITCH_MOTH = `<svg class="cc-stitch" viewBox="0 0 16 14" aria-hidden="true" focusable="false">
  <path class="cc-st-def" d="M7.600 2A5.300 5.300 0 1 0 9.200 12 4.200 4.200 0 0 1 7.600 2z"/>
  <path class="cc-st-def cc-st-star" d="M12.200 1.200Q12.600 4.400 15.600 4.800Q12.600 5.200 12.200 8.400Q11.800 5.200 8.800 4.800Q11.800 4.400 12.200 1.200z"/>
  <path class="cc-st-alt cc-st-dark" d="M8 1.500c3 3.500 4.500 5.500 4.500 7.500a4.500 4.500 0 0 1-9 0c0-2 1.500-4 4.500-7.500zM6 9c0 1.500 1 2.300 2.500 2.500"/>
  <path class="cc-st-alt cc-st-forest" d="M2 12C5 8 9 4.500 14 3M5.500 9.500c-1.500-.5-2.500-1.800-2.500-3 1.800.2 2.800 1.200 2.500 3zM9 6.500c-.8-1.600-.4-3.200.8-4 1 1.300.9 3-.8 4zM10.500 8c1.800.2 3.200-.4 3.500-1.800-1.800-.6-3.200.2-3.500 1.800z"/>
  <path class="cc-st-alt cc-st-temple" d="M8 1.500v11M2.500 7h11M4 3l8 8M12 3l-8 8M8 4.500 9.200 7 8 9.500 6.800 7z"/>
</svg>`;
export const STITCH_LAVENDER = `<svg class="cc-stitch" viewBox="0 0 14 22" aria-hidden="true" focusable="false">
  <path class="cc-st-def" d="M7 21V4M7 5c-2-.4-3-2-2.600-3.600 1.600.2 2.600 1.600 2.600 3.600zM7 5c2-.4 3-2 2.600-3.600-1.600.2-2.600 1.600-2.600 3.600zM7 11c-2-.4-3-2-2.600-3.600 1.600.2 2.600 1.600 2.600 3.600zM7 11c2-.4 3-2 2.600-3.600-1.600.2-2.600 1.600-2.600 3.600zM7 17c-2-.4-3-2-2.600-3.600 1.600.2 2.600 1.600 2.600 3.600zM7 17c2-.4 3-2 2.600-3.600-1.600.2-2.600 1.600-2.600 3.600z"/>
  <path class="cc-st-alt cc-st-dark" d="M7 1v20M3.500 5h7M5.500 5v-2M8.500 5v-2M5 16.500h4M7 21l-1.500-2.500h3z"/>
  <path class="cc-st-alt cc-st-forest" d="M7 21C6 15 7.500 9 7 3M7 18c-2.500-.5-4-2-4-4 2.500 0 4 1.500 4 4zM7 18c2.500-.5 4-2 4-4-2.500 0-4 1.500-4 4zM7 11c-2-.5-3.200-1.800-3.200-3.500 2 0 3.200 1.300 3.200 3.500zM7 11c2-.5 3.200-1.800 3.200-3.500-2 0-3.200 1.300-3.200 3.500zM7 5.500c-1.200-1-1.500-2.500-.8-3.800.9 1 1.200 2.500.8 3.800zM7 5.500c1.200-1 1.500-2.500.8-3.800-.9 1-1.200 2.500-.8 3.800z"/>
  <path class="cc-st-alt cc-st-temple" d="M3 20h8M4 17.500h6M5 17.500V6.500M9 17.500V6.500M7 17.500V6.500M3.500 6h7M7 1.500l5 3.500H2z"/>
</svg>`;

// Птица над томом (у кожи по умолчанию колибри) и предмет на нижнем поле, у каждой кожи свои.
export const MOTH_ALT = `<div class="cc-mascot cc-hum"><i class="cc-mf cc-mf-rest"></i><i class="cc-mf cc-mf-look"></i><i class="cc-mf cc-mf-wings"></i></div>
<div class="cc-mascot cc-alt cc-alt-dark cc-raven"><i class="cc-mf cc-mf-rest"></i><i class="cc-mf cc-mf-look"></i><i class="cc-mf cc-mf-wings"></i></div>
<div class="cc-mascot cc-alt cc-alt-forest cc-owl"><i class="cc-mf cc-mf-rest"></i><i class="cc-mf cc-mf-blink"></i><i class="cc-mf cc-mf-fluff"></i></div>
<div class="cc-mascot cc-alt cc-alt-temple cc-dove"><i class="cc-mf cc-mf-rest"></i><i class="cc-mf cc-mf-preen"></i><i class="cc-mf cc-mf-wings"></i></div>`;
export const LAVENDER_ALT = `<i class="cc-bt cc-bt-def"></i><i class="cc-bt cc-bt-dark"></i><i class="cc-bt cc-bt-forest"></i><i class="cc-bt cc-bt-temple"></i>`;
