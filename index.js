const MODULE = 'cena-chuda';
const base = import.meta.url;

// Загрузчик не меняется: версия из манифеста попадает в адреса всех модулей, и после обновления браузер не держит старые.
let version = '';
try {
  const res = await fetch(new URL('./manifest.json', base), { cache: 'no-store' });
  version = String((await res.json()).version ?? '');
} catch { /* без версии */ }
try {
  await import(new URL(version ? `./app.js?v=${encodeURIComponent(version)}` : './app.js', base));
} catch (err) {
  console.error(`[${MODULE}] не удалось загрузить расширение:`, err);
}
