import matter from './matter.js?v=0.1.28';
import body from './body.js?v=0.1.28';
import mind from './mind.js?v=0.1.28';
import images from './images.js?v=0.1.28';
import bonds from './bonds.js?v=0.1.28';
import bounds from './bounds.js?v=0.1.28';
import desire from './desire.js?v=0.1.28';

// id заклинания → тело SVG; школа даёт модуль, чтобы знаки одной школы правились отдельно.
export const SPELL_ICONS = { ...matter, ...body, ...mind, ...images, ...bonds, ...bounds, ...desire };
export const ICON_SCHOOLS = { matter, body, mind, images, bonds, bounds, desire };
