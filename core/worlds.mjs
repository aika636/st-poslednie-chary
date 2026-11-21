// Словарь сеттинга по коже: названия чар, школ, источников и слов механики. Без DOM и ST.
import { WORLDS } from './data/worlds.mjs?v=0.1.17';

export const worldOf = (skin) => WORLDS[skin] ?? null;

const builtin = (spell) => spell?.id && !String(spell.id).startsWith('custom:');
export const spellName = (spell, world) => (builtin(spell) && world?.spells?.[spell.id]) || spell?.name;
export const schoolName = (dir, world) => world?.schools?.[dir?.id] ?? dir?.name;
export const sourceName = (src, world) => world?.sources?.[src?.id] ?? src?.name;
export const wordOf = (world, key, fallback) => world?.words?.[key] ?? fallback;

// Имена, по которым чару ищут: исходное и мировое.
export const spellNames = (spell, world) => [...new Set([spell?.name, spellName(spell, world)].filter(Boolean))];

// Фраза для модели о переименованных словах: «напряжение зовут „бременем“…».
export function wordsText(world) {
  const w = world?.words;
  if (!w) return '';
  const parts = [['strain', 'напряжение'], ['fracture', 'надлом'], ['rest', 'отдых']]
    .filter(([k]) => w[k]).map(([k, base], i) => `${base}${i ? ' —' : ' зовут'} «${w.ins?.[k] ?? w[k].toLowerCase()}»`);
  return parts.length ? `Здесь ${parts.join(', ')}.` : '';
}
