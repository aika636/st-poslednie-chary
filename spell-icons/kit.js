// Тела знаков заклинаний: сетка 24×24, один слой. L — контур, F — заливка (не более одной формы на знак).
export const L = (d, extra = '') => `<path d="${d}" class="cc-g-line"${extra}/>`;
export const F = (d) => `<path d="${d}" class="cc-g-fill"/>`;
// эллипс замкнутым контуром
export const E = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
