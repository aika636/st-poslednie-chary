// Профиль персоны, начальный снимок и состояние. Снимок — состояние до журнала:
// его не перезаписывают, иначе удаление старого сообщения не отменит последствий.
import { SCALE, SOURCES, ENVIRONMENTS, fractureLoad } from './rules.mjs?v=0.1.1';
import { canonicalFavorites } from './data/spell-replacements.mjs?v=0.1.1';

export const cloneState = (s) => structuredClone(s);

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

// Профиль: источник и его настройка, образ магии, избранное, постоянные свойства.
export function createProfile(input = {}) {
  const source = input.source ?? 'knowledge';
  if (!SOURCES.includes(source)) throw new Error(`неизвестный источник «${source}»`);
  return {
    name: text(input.name),
    source,
    signature: text(input.signature),
    expression: text(input.expression),
    vows: list(input.vows).filter((t) => typeof t === 'string'),
    patron: text(input.patron),
    favorites: canonicalFavorites(list(input.favorites)),
    traits: list(input.traits).map((t) => ({ ...t })),
  };
}

// Снимок допускает начальные значения (напряжение, надломы), чтобы продолжить историю,
// начатую без расширения.
export function createSnapshot(input = {}) {
  const strain = input.strain ?? 0;
  if (!Number.isInteger(strain) || strain < 0 || strain > SCALE) throw new Error(`напряжение должно быть от 0 до ${SCALE}`);
  const environment = input.environment ?? 'unspecified';
  if (!ENVIRONMENTS.includes(environment)) throw new Error(`неизвестная среда «${environment}»`);
  return {
    profile: createProfile(input.profile),
    strain,
    fractures: list(input.fractures).map((f) => ({ ...f })),
    giftUsed: Boolean(input.giftUsed),
    breatherUsed: Boolean(input.breatherUsed),
    environment,
  };
}

export function initialState(snapshot) {
  const s = createSnapshot(snapshot);
  return {
    profile: s.profile,
    strain: s.strain,
    fractures: s.fractures,
    effects: [],
    notes: [],
    debts: [],
    giftUsed: s.giftUsed,
    breatherUsed: s.breatherUsed,
    environment: s.environment,
    scene: 1,
    casts: {},
    history: [],
  };
}

// Нарушенный инвариант — ошибка в коде ядра, а не в действиях игрока.
export function checkInvariants(state) {
  const problems = [];
  if (!Number.isInteger(state.strain) || state.strain < 0) problems.push('обычное напряжение отрицательно или дробно');
  if (state.strain + Math.min(SCALE, fractureLoad(state.fractures)) > SCALE) problems.push('шкала больше максимума');
  if (state.fractures.some((f) => !Number.isInteger(f.weight) || f.weight < 1)) problems.push('надлом с весом меньше 1');
  const ids = [...state.effects, ...state.fractures, ...state.debts, ...state.notes].map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push('повторяющиеся id');
  return problems;
}
