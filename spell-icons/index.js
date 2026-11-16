import matter from './matter.js?v=0.1.11';
import body from './body.js?v=0.1.11';
import mind from './mind.js?v=0.1.11';
import images from './images.js?v=0.1.11';
import bonds from './bonds.js?v=0.1.11';
import bounds from './bounds.js?v=0.1.11';
import desire from './desire.js?v=0.1.11';

// id заклинания → тело SVG; школа даёт модуль, чтобы знаки одной школы правились отдельно.
export const SPELL_ICONS = { ...matter, ...body, ...mind, ...images, ...bonds, ...bounds, ...desire };
export const ICON_SCHOOLS = { matter, body, mind, images, bonds, bounds, desire };
