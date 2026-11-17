// Per-headset link health for the headset card: ping now, min/max over the last 30 min, drops.
// The server measures the ping itself (WebSocket ping/pong, works with every page version); a page that
// answers the `ping` message with `health {pingMs}` is counted the same way.

export const WINDOW_MS = 30 * 60_000;

export function createHealth({ now = () => Date.now(), windowMs = WINDOW_MS } = {}) {
  const per = new Map();     // id → { samples:[[t, ms]], drops:[t], dropsTotal, lastDropAt, pingMs }
  const get = id => { let e = per.get(id); if (!e) per.set(id, e = { samples: [], drops: [], dropsTotal: 0, lastDropAt: null, pingMs: null }); return e; };
  const trim = e => {
    const from = now() - windowMs;
    while (e.samples.length && e.samples[0][0] < from) e.samples.shift();
    while (e.drops.length && e.drops[0] < from) e.drops.shift();
    if (e.samples.length > 2000) e.samples.splice(0, e.samples.length - 2000);
  };
  return {
    ping(id, ms) {
      if (!id || !Number.isFinite(ms) || ms < 0 || ms > 60_000) return;
      const e = get(id);
      e.pingMs = Math.round(ms);
      e.samples.push([now(), e.pingMs]);
      trim(e);
    },
    drop(id) {
      if (!id) return;
      const e = get(id);
      e.drops.push(now()); e.dropsTotal++; e.lastDropAt = now(); e.pingMs = null;
      trim(e);
    },
    /** { pingMs, pingMin, pingMax, drops (30 min), dropsTotal, lastDropAt, wifi } */
    view(id, wifi = null) {
      const e = per.get(id);
      if (!e) return { pingMs: null, pingMin: null, pingMax: null, drops: 0, dropsTotal: 0, lastDropAt: null, wifi };
      trim(e);
      const v = e.samples.map(s => s[1]);
      return {
        pingMs: e.pingMs, pingMin: v.length ? Math.min(...v) : null, pingMax: v.length ? Math.max(...v) : null,
        drops: e.drops.length, dropsTotal: e.dropsTotal, lastDropAt: e.lastDropAt ? new Date(e.lastDropAt).toISOString() : null, wifi,
      };
    },
  };
}
