import { judgeRoll, threshold } from './core/rules.mjs?v=0.1.1';

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

function escapeAttr(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function resultFor(row) {
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
      spell: cast?.spell?.name ?? payload.spell?.name ?? 'Заклинание',
      outcome: outcome ?? 'unknown',
    };
  }
  if (event?.kind === 'faith_pray' && validD20(payload.d20)) {
    const prayer = row.after?.casts?.[payload.castId]?.prayer;
    const answered = prayer ? prayer.answered : payload.d20 >= 11;
    return {
      id: `prayer:${event.id}`, kind: 'prayer', value: payload.d20,
      spell: row.after?.casts?.[payload.castId]?.spell?.name ?? 'чудо',
      outcome: answered ? 'answered' : 'silent',
    };
  }
  return null;
}

/** Extract only committed d20 events. Pending preview rows are never inspected. */
export function committedRolls(view) {
  return (Array.isArray(view?.rows) ? view.rows : []).map(resultFor).filter(Boolean);
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
  let dismissed = false;

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
    if (!queue.length || destroyed || dismissed) return;
    const roll = queue.shift();
    if (!doc?.body) return;
    mounted = doc.createElement('section');
    mounted.className = 'cc-dice-result is-rolling';
    mounted.setAttribute('aria-label', 'Результат броска');
    mounted.innerHTML = `<div class="cc-dice-result__art">${diceSvg(null, { className: 'cc-dice-result__die' })}</div>
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
      if (!mounted || destroyed || dismissed) return;
      mounted.classList.remove('is-rolling');
      mounted.classList.add('is-settling');
      mounted.dataset.outcome = outcomeTone(roll);
      mounted.querySelector('.cc-dice-result__art').innerHTML = diceSvg(roll.value, { className: 'cc-dice-result__die' });
      mounted.querySelector('.cc-dice-result__number').textContent = `d20: ${roll.value}`;
      mounted.querySelector('.cc-dice-result__outcome').textContent = outcomeText(roll);
      timer = setTimeout(finish, 3000);
    };
    timer = setTimeout(reveal, motionOff ? 0 : 1000);
  };

  return {
    update(view, { committed = false } = {}) {
      if (destroyed) return;
      if (!view?.chatOpen || view.unsupported || view.settings?.enabled === false) {
        cleanup(); queue = []; seen = new Set(); chatId = view?.chatId ?? null; dismissed = false;
        return;
      }
      if ((view?.chatId ?? null) !== chatId) {
        cleanup(); queue = []; seen = new Set(); chatId = view?.chatId ?? null; dismissed = false;
        for (const roll of committedRolls(view)) seen.add(roll.id);
        return;
      }
      const result = newRolls(seen, view);
      seen = result.seen;
      if (!committed || !result.rolls.length || dismissed) return;
      dismissed = false;
      queue.push(...result.rolls);
      if (!mounted && timer === null) finish();
    },
    destroy() { destroyed = true; queue = []; cleanup(); },
  };
}
