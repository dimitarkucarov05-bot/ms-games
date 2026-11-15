// Видът на таблата в играта: панели, ленти и икони от пакета на Synty „INTERFACE Modern Menus"
// (lobby/public/play/assets/ui/modern/, извадени от библиотеката). Собственикът не иска саморисувани черно-жълти
// табла: всичко, което е интерфейс, се рисува с тези картинки върху 2D платно.
// Докато картинките се зареждат, рисува плоско в същите цветове; после вика записаните функции да прерисуват.

const BASE = '/play/assets/ui/modern/';
const NAMES = [
  'Box_Medium_01_Front', 'Box_Medium_04_Dark_Front', 'Bar_Capsule_02', 'Banner_01', 'Button_08',
  'icon3d_Timer_01', 'icon3d_Currency_Notes_01', 'icon3d_ExclamationMark_01', 'icon3d_Shop_01', 'icon3d_Star_01',
  'icon3d_Info_01', 'icon3d_Lightning_01', 'icon3d_Death_01', 'icon3d_Confirm_01', 'icon3d_Cancel_01',
];

/** Цветовете на интерфейса. face се взима от самия панел, щом той се зареди. */
export const SKIN = {
  face: '#dbe6f5', ink: '#1b2a41', ink2: '#3b4d68', dim: '#63768f', line: '#9db1cc', track: '#aebdd3',
  good: '#2c9b50', warn: '#e7821a', bad: '#d93c33', accent: '#2f7de1',
};

const img = {};
const waiting = new Set();
let started = false, ready = false;

export function skinReady() { return ready; }
/** Записва функция, която да се извика, щом картинките са готови (за прерисуване). Връща отписване. */
export function onSkin(fn) { waiting.add(fn); loadSkin(); return () => waiting.delete(fn); }

export function loadSkin() {
  if (started || typeof Image === 'undefined') return;
  started = true;
  let left = NAMES.length;
  const done = () => {
    if (--left > 0) return;
    ready = true;
    const p = img.Box_Medium_01_Front;
    if (p) {      // цветът на лицето на панела: по него се боядисват кръпките, които се рисуват отгоре (часовникът)
      try {
        const c = document.createElement('canvas'); c.width = c.height = 4;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(p, p.width * 0.4, p.height * 0.4, p.width * 0.2, p.height * 0.2, 0, 0, 4, 4);
        const d = g.getImageData(1, 1, 1, 1).data;
        if (d[3] > 200) SKIN.face = `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      } catch { /* остава цветът по подразбиране */ }
    }
    for (const fn of [...waiting]) { try { fn(); } catch (e) { console.warn('[ui-skin]', e); } }
  };
  for (const n of NAMES) {
    const im = new Image();
    im.onload = () => { img[n] = im; done(); };
    im.onerror = () => done();
    im.src = `${BASE}${n}.png`;
  }
}

/** Картинка, опъната на девет части: ъглите остават с размера си, средата се разтяга. */
function nine(g, im, x, y, w, h, src, dst) {
  const W = im.width, H = im.height, s = Math.min(src, W / 2 - 1, H / 2 - 1), d = Math.min(dst, w / 2, h / 2);
  const sx = [0, s, W - s], sw = [s, W - 2 * s, s], dx = [x, x + d, x + w - d], dw = [d, w - 2 * d, d];
  const sy = [0, s, H - s], sh = [s, H - 2 * s, s], dy = [y, y + d, y + h - d], dh = [d, h - 2 * d, d];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (dw[i] <= 0 || dh[j] <= 0) continue;
    g.drawImage(im, sx[i], sy[j], sw[i], sh[j], dx[i], dy[j], dw[i] + 0.5, dh[j] + 0.5);
  }
}

/**
 * Панел (фонът на табло). opts.dark: тъмният вариант; opts.border: дебелина на ръба върху платното;
 * opts.flat = false оставя преливането на картинката и в средата (по подразбиране средата е равен цвят,
 * за да пасват кръпките отгоре).
 */
export function panel(g, x, y, w, h, opts = {}) {
  const im = img[opts.dark ? 'Box_Medium_04_Dark_Front' : 'Box_Medium_01_Front'];
  const b = opts.border ?? Math.max(14, Math.min(46, Math.min(w, h) * 0.2));
  g.clearRect(x, y, w, h);
  if (!im) {
    g.fillStyle = opts.dark ? '#1d2636' : SKIN.face;
    g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, b * 0.6); g.fill();
    return;
  }
  nine(g, im, x, y, w, h, 150, b);
  if (opts.flat !== false && !opts.dark) {
    g.fillStyle = SKIN.face;
    g.fillRect(x + b * 0.72, y + b * 0.62, w - b * 1.44, h - b * 1.5);
  }
}

/** Икона по име (без „icon3d_"): Timer_01, Currency_Notes_01, ExclamationMark_01, Shop_01, Star_01, Info_01 … */
export function icon(g, name, x, y, size) {
  const im = img[`icon3d_${name}`];
  if (!im) return false;
  const k = size / Math.max(im.width, im.height);
  g.drawImage(im, x + (size - im.width * k) / 2, y + (size - im.height * k) / 2, im.width * k, im.height * k);
  return true;
}

/** Улей на лента за напредък. */
export function track(g, x, y, w, h) {
  g.fillStyle = SKIN.track;
  g.beginPath(); g.roundRect(x, y, w, h, Math.min(h / 2, 8)); g.fill();
}
