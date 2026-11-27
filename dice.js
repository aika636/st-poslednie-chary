import { judgeRoll, threshold } from './core/rules.mjs?v=0.1.27';
import { worldOf, spellName } from './core/worlds.mjs?v=0.1.27';

const validD20 = (value) => Number.isInteger(value) && value >= 1 && value <= 20;

/** Return a decorative d20 SVG. A null value leaves its face blank while rolling. */
export function diceSvg(value = null, { className = '' } = {}) {
  const face = validD20(value) ? String(value) : '';
  const cls = className ? ` class="${escapeAttr(className)}"` : '';
  return `<svg${cls} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="cc-dice-body" x1=".12" y1=".08" x2=".88" y2=".96"><stop stop-color="#9b72d1"/><stop offset=".52" stop-color="#59378e"/><stop offset="1" stop-color="#26163f"/></linearGradient>
      <linearGradient id="cc-dice-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8dfa0"/><stop offset="1" stop-color="#b98b45"/></linearGradient>
      <filter id="cc-dice-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="M60 7 101 27 113 68 88 106 32 106 7 68 19 27Z" fill="url(#cc-dice-body)" stroke="url(#cc-dice-gold)" stroke-width="2.5"/>
    <g fill="none" stroke="#53d9d0" stroke-opacity=".78" stroke-width="1.35">
      <path d="m60 7-18 27 18 21 18-21Z M19 27l23 7-18 34 36-13 36 13-18-34 23-7 M7 68l35-34 18 21 18-21 35 34-25 38H32Z M42 34 32 106 M78 34l10 72 M7 68h106 M42 34l-10 72 M78 34l10 72"/>
      <path d="m60 55-18 51h46Z" fill="#2bb3ad" fill-opacity=".18"/>
    </g>
    <path d="M60 7 42 34 19 27Z M60 7l18 27 23-7Z M7 68l35-34-18 34Z M113 68 78 34l18 34Z" fill="#fff" fill-opacity=".1"/>
    ${face ? `<text x="60" y="77" text-anchor="middle" fill="#fff4d5" stroke="#28183d" stroke-width="2.8" paint-order="stroke" font-family="Georgia,serif" font-size="29" font-weight="700" filter="url(#cc-dice-glow)">${face}</text>` : '<circle cx="60" cy="70" r="3" fill="#f3d99c"/>'}
  </svg>`;
}

/* Икосаэдр для CSS 3D: грань — треугольник со стороной 100 px, центроид в центре кубика. */
const PHI = (1 + Math.sqrt(5)) / 2;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const D20_EDGE = 100;
const D20_DIST = D20_EDGE * PHI * PHI / (2 * Math.sqrt(3));
const fix = (n) => Number(n.toFixed(5));

function buildFaces() {
  const raw = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) raw.push([0, a, b], [a, b, 0], [b, 0, a]);
  const edge = Math.hypot(...sub(raw[0], raw.find((v, i) => i && Math.abs(Math.hypot(...sub(raw[0], v)) - 2) < 1e-6)));
  const idx = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const d = [[i, j], [j, k], [i, k]].map(([p, q]) => Math.hypot(...sub(raw[p], raw[q])));
    if (d.every((x) => Math.abs(x - edge) < 1e-6)) idx.push([i, j, k]);
  }
  const faces = idx.map((t) => {
    const v = t.map((i) => raw[i]);
    const c = v[0].map((_, i) => (v[0][i] + v[1][i] + v[2][i]) / 3);
    const n = unit(c);
    const y = unit(sub(c, v[0]));
    const x = cross(y, n);
    return { n, x, y, z: n };
  });
  // Числа: противоположные грани дают в сумме 21, как на настоящем кубике.
  let next = 1;
  for (const f of faces) {
    if (f.value) continue;
    const opp = faces.find((g) => !g.value && g !== f && dot(g.n, f.n) < -0.999);
    f.value = next; opp.value = 21 - next; next++;
  }
  return faces;
}
const D20_FACES = buildFaces();

/** Кубик d20 из 20 CSS-граней. Грань с value развёрнута к зрителю числом вверх. */
export function d20Solid(value, { className = '' } = {}) {
  const target = D20_FACES.find((f) => f.value === value) ?? D20_FACES[19];
  const cls = className ? ` ${escapeAttr(className)}` : '';
  const m = (f) => [...f.x, 0, ...f.y, 0, ...f.z, 0, ...f.n.map((v) => v * D20_DIST), 1].map(fix).join(',');
  // Свет задан в кадре зрителя; в кадре кубика он поворачивается обратно итоговым поворотом.
  const light = unit([-.4, -.7, .6]);
  const lightDie = [0, 1, 2].map((i) => target.x[i] * light[0] + target.y[i] * light[1] + target.z[i] * light[2]);
  const faces = D20_FACES.map((f) => {
    // Вершина грани смотрит вверх (−y): значит, у грани, повёрнутой к зрителю, y — вниз по экрану.
    const lit = Math.max(0, dot(f.n, lightDie));
    const six = f.value === 6 || f.value === 9 ? '.' : '';
    return `<i class="cc-d20__face" style="--l:${fix(lit)};transform:matrix3d(${m(f)})"><b>${f.value}${six}</b></i>`;
  }).join('');
  const r = [target.x, target.y, target.z];
  const final = [0, 1, 2].flatMap((c) => [...r.map((row) => row[c]), 0]).concat([0, 0, 0, 1]).map(fix).join(',');
  return `<div class="cc-d20${cls}" aria-hidden="true" data-value="${escapeAttr(value)}"><div class="cc-d20__spin cc-d20__spin--a"><div class="cc-d20__spin cc-d20__spin--b"><div class="cc-d20__body" style="transform:matrix3d(${final})">${faces}</div></div></div></div>`;
}

function escapeAttr(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function resultFor(row, world = null) {
  if (!row || row.pending || row.disabled || row.ok === false) return null;
  const event = row?.event;
  const payload = event?.payload ?? {};
  if (event?.kind === 'cast' && validD20(payload.roll?.d20)) {
    const cast = row.after?.casts?.[event.id];
    let outcome = cast?.outcome ?? payload.outcome;
    if (!outcome && payload.spell?.resist && payload.roll?.difficulty) {
      try { outcome = judgeRoll(payload.roll.d20, threshold(payload.spell, payload.roll.difficulty)); } catch { /* malformed historical event */ }
    }
    return {
      id: `cast:${event.id}`, kind: 'cast', value: payload.roll.d20,
      spell: spellName(cast?.spell ?? payload.spell, world) ?? 'Заклинание',
      outcome: outcome ?? 'unknown',
    };
  }
  if (event?.kind === 'faith_pray' && validD20(payload.d20)) {
    const prayer = row.after?.casts?.[payload.castId]?.prayer;
    const answered = prayer ? prayer.answered : payload.d20 >= 11;
    return {
      id: `prayer:${event.id}`, kind: 'prayer', value: payload.d20,
      spell: spellName(row.after?.casts?.[payload.castId]?.spell, world) ?? 'чудо',
      outcome: answered ? 'answered' : 'silent',
    };
  }
  return null;
}

/** Extract only committed d20 events. Pending preview rows are never inspected. */
export function committedRolls(view) {
  const world = worldOf(view?.settings?.skin);
  return (Array.isArray(view?.rows) ? view.rows : []).map((r) => resultFor(r, world)).filter(Boolean);
}

/** Pure detection helper. Seen keys are retained when history is removed. */
export function newRolls(previousSeen, view) {
  const seen = new Set(previousSeen ?? []);
  const rolls = [];
  for (const roll of committedRolls(view)) {
    if (!seen.has(roll.id)) rolls.push(roll);
    seen.add(roll.id);
  }
  return { rolls, seen };
}

/** Pure chat-aware baseline update used by the presenter. */
export function updateRollBaseline(previous, view, { committed = false } = {}) {
  const chatId = view?.chatId ?? null;
  if (previous?.chatId !== chatId) {
    return { chatId, seen: new Set(committedRolls(view).map((roll) => roll.id)), rolls: [] };
  }
  const result = newRolls(previous?.seen, view);
  return { chatId, ...result, rolls: committed ? result.rolls : [] };
}

const outcomeText = (roll) => {
  if (roll.kind === 'prayer') return roll.outcome === 'answered' ? 'Молитва услышана' : roll.outcome === 'silent' ? 'Молитва без ответа' : 'Молитва';
  return ({ success: 'Успех', failure: 'Провал', complication: 'Успех с осложнением' })[roll.outcome] ?? 'Исход зафиксирован';
};

const outcomeTone = (roll) => {
  if (roll.kind === 'prayer') return roll.outcome === 'answered' ? 'success' : roll.outcome === 'silent' ? 'failure' : 'unknown';
  return roll.outcome;
};

/** Mount a body-level result presenter. Call update(view) on every refresh and
 * update(view, { committed: true }) only after a user message commits events. */
export function createDicePresenter({ document: doc = globalThis.document, reducedMotion } = {}) {
  let chatId;
  let seen = new Set();
  let queue = [];
  let timer = null;
  let mounted = null;
  let destroyed = false;
  let skin = 'amethyst';

  const cleanup = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    mounted?.remove();
    mounted = null;
  };
  const finish = () => {
    timer = null;
    mounted?.remove();
    mounted = null;
    if (!queue.length || destroyed) return;
    const roll = queue.shift();
    if (!doc?.body) return;
    mounted = doc.createElement('section');
    mounted.className = 'cc-dice-result is-rolling';
    mounted.dataset.skin = skin;
    mounted.setAttribute('aria-label', 'Результат броска');
    mounted.innerHTML = `<div class="cc-dice-result__art">${d20Solid(roll.value, { className: 'cc-dice-result__die' })}</div>
      <div class="cc-dice-result__copy"><span class="cc-dice-result__spell"></span><strong class="cc-dice-result__number"></strong><span class="cc-dice-result__outcome" aria-live="polite"></span></div>
      <button class="cc-dice-result__close" type="button">Закрыть результат броска</button>`;
    mounted.querySelector('.cc-dice-result__spell').textContent = roll.kind === 'prayer' ? `Молитва за «${roll.spell}»` : roll.spell;
    mounted.querySelector('button').addEventListener('click', () => {
      queue = [];
      cleanup();
    });
    doc.body.append(mounted);
    const motionOff = reducedMotion ?? doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const reveal = () => {
      if (!mounted || destroyed) return;
      mounted.classList.remove('is-rolling');
      mounted.classList.add('is-settling');
      mounted.dataset.outcome = outcomeTone(roll);
      mounted.querySelector('.cc-dice-result__number').textContent = `d20: ${roll.value}`;
      mounted.querySelector('.cc-dice-result__outcome').textContent = outcomeText(roll);
      timer = setTimeout(finish, 3000);
    };
    timer = setTimeout(reveal, motionOff ? 0 : 1000);
  };

  return {
    update(view, { committed = false } = {}) {
      if (destroyed) return;
      if (view?.settings?.skin) { skin = view.settings.skin; if (mounted) mounted.dataset.skin = skin; }
      if (!view?.chatOpen || view.unsupported || view.settings?.enabled === false) {
        cleanup(); queue = []; seen = new Set(); chatId = view?.chatId ?? null;
        return;
      }
      if ((view?.chatId ?? null) !== chatId) {
        cleanup(); queue = []; seen = new Set(); chatId = view?.chatId ?? null;
        for (const roll of committedRolls(view)) seen.add(roll.id);
        return;
      }
      const result = newRolls(seen, view);
      seen = result.seen;
      if (!committed || !result.rolls.length) return;
      queue.push(...result.rolls);
      if (!mounted && timer === null) finish();
    },
    destroy() { destroyed = true; queue = []; cleanup(); },
  };
}
