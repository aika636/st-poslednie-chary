import tome from './tome.js?v=0.1.27';
import phone from './phone.js?v=0.1.27';

export const shells = { tome, phone };
export const shellOf = (view) => shells[view?.settings?.item] ?? tome;
