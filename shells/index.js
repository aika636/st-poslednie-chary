import tome from './tome.js?v=0.1.13';
import phone from './phone.js?v=0.1.13';

export const shells = { tome, phone };
export const shellOf = (view) => shells[view?.settings?.item] ?? tome;
