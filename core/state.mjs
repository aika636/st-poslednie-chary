// Профиль персоны, начальный снимок и состояние. Снимок — состояние до журнала:
// его не перезаписывают, иначе удаление старого сообщения не отменит последствий.
import { SOURCES, ENVIRONMENTS, MASTERIES, DEFAULT_MASTERY, scaleFor, fractureLoad, severityOf } from './rules.mjs?v=0.1.14';
import { canonicalFavorites } from './data/spell-replacements.mjs?v=0.1.14';

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
    mastery: MASTERIES.includes(input.mastery) ? input.mastery : DEFAULT_MASTERY,
    signature: text(input.signature),
    expression: text(input.expression),
    vows: list(input.vows).filter((t) => typeof t === 'string'),
    patron: text(input.patron),
    favorites: canonicalFavorites(list(input.favorites)),
    traits: list(input.traits).map((t) => ({ ...t })),
  };
}

// Снимок допускает начальные значения (напряжение, надломы), чтобы продолжить историю,
// начатую без расширения. lenient — для снимков уже в чате: проверки веса и суммы не бросают.
export function createSnapshot(input = {}, { lenient = false } = {}) {
  const strain = input.strain ?? 0;
  const profile = createProfile(input.profile);
  const cap = scaleFor(profile);
  if (!Number.isInteger(strain) || strain < 0 || strain > cap) throw new Error(`напряжение должно быть от 0 до ${cap}`);
  const environment = input.environment ?? 'unspecified';
  if (!ENVIRONMENTS.includes(environment)) throw new Error(`неизвестная среда «${environment}»`);
  const fractures = list(input.fractures).map((f) => ({ ...f, severity: f.severity ?? (Number.isInteger(f.weight) ? severityOf(f.weight) : 1) }));
  if (!lenient) {
    if (fractures.some((f) => !Number.isInteger(f.weight) || f.weight < 1)) throw new Error('вес надлома должен быть целым от 1');
    if (strain + Math.min(cap, fractureLoad(fractures)) > cap) throw new Error('напряжение вместе с надломами больше шкалы');
  }
  return {
    profile,
    strain,
    fractures,
    giftUsed: Boolean(input.giftUsed),
    breatherUsed: Boolean(input.breatherUsed),
    environment,
  };
}

export function initialState(snapshot) {
  const s = createSnapshot(snapshot, { lenient: true });
  return {
    profile: s.profile,
    strain: s.strain,
    fractures: s.fractures,
    effects: [],
    notes: [],
    debts: [],
    giftUsed: s.giftUsed,
    lastPaid: null,
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
  const cap = scaleFor(state.profile);
  if (state.strain + Math.min(cap, fractureLoad(state.fractures)) > cap) problems.push('шкала больше максимума');
  if (state.fractures.some((f) => !Number.isInteger(f.weight) || f.weight < 1)) problems.push('надлом с весом меньше 1');
  const ids = [...state.effects, ...state.fractures, ...state.debts, ...state.notes].map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push('повторяющиеся id');
  return problems;
}
