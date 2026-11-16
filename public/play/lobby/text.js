// Text in the world, the only way MS Games writes anything in the headset: bold white letters with a thin dark
// outline, no box, no panel behind them.
//
//   const t = makeText(THREE, 1.6, 0.9);       // plane size in metres
//   t.set([{ text: '3', px: 420, font: 'num' }, { text: 'Get ready', px: 64 }]);

export const FONT = '"Sofia Sans", "Segoe UI", sans-serif';
export const FONT_NUM = '"Sofia Sans XC", "Sofia Sans", sans-serif';

export function makeText(THREE, w, h, pxPerM = 600, { depthTest = false, order = 21 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * pxPerM); canvas.height = Math.round(h * pxPerM);
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false;
  let sig = '';

  /**
   * lines: [{ text, px = 56, weight = 800, font: 'body'|'num', color = '#fff', gap = 0.28, align = 'center', cols }]
   * cols: [[text, x 0..1, align, maxWidth 0..1]] draws one row in columns (results table). Lines are stacked and the block centred.
   */
  function set(lines, { valign = 'middle' } = {}) {
    const s = JSON.stringify(lines);
    if (s === sig) { mesh.visible = !!lines.length; return; }
    sig = s;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const L = lines.map(l => ({ px: 56, weight: 800, font: 'body', color: '#ffffff', gap: 0.28, align: 'center', ...l }));
    const total = L.reduce((a, l, i) => a + l.px + (i ? l.px * l.gap : 0), 0);
    let y = valign === 'top' ? 0 : (canvas.height - total) / 2;
    g.lineJoin = 'round'; g.textBaseline = 'top';
    L.forEach((l, i) => {
      if (i) y += l.px * l.gap;
      g.font = `${l.weight} ${l.px}px ${l.font === 'num' ? FONT_NUM : FONT}`;
      g.lineWidth = Math.max(3, l.px * 0.085); g.strokeStyle = 'rgba(0, 0, 0, 0.78)'; g.fillStyle = l.color;
      const max = canvas.width * 0.96;
      const draw = (t, x, align, m = max) => { g.textAlign = align; g.strokeText(t, x, y, m); g.fillText(t, x, y, m); };
      if (l.cols) for (const [t, fx, a, mw] of l.cols) draw(String(t), canvas.width * fx, a || 'left', mw ? canvas.width * mw : max);
      else if (l.text) draw(String(l.text), l.align === 'left' ? canvas.width * 0.03 : canvas.width / 2, l.align === 'left' ? 'left' : 'center');
      y += l.px;
    });
    tex.needsUpdate = true;
    mesh.visible = !!lines.length;
  }
  function dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); mesh.removeFromParent(); }
  return { mesh, canvas, set, dispose, clear() { set([]); } };
}
