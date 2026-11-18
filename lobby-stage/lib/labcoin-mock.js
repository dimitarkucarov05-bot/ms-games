// A pretend LabCoin for trying the arena without the real server (LABCOIN_MOCK=1, or "mode":"mock" in data/labcoin.json).
// It answers like the contract in docs/LABCOIN-LINK.md. Test codes (6 characters, can be reused here, the real ones are single use):
//   HOTDOG  adult, the Hot-dog skin, LabPass on (perk: x2 HEX)      WOMAN1  teen, the Woman skin
//   KID001  kid, the Dino skin                                       BANNED  error banned
//   EXPIRE  error code_expired                                       USED01  error code_used     anything else: code_unknown
// HEX defaults of the real thing (LCAdmin, 18.11.2026): 50 per match played, +50 for a win or a top-3 place, 300 per player per day.

export const MOCK_CODES = ['HOTDOG', 'WOMAN1', 'KID001', 'BANNED', 'EXPIRE', 'USED01'];

const SKINS = {
  481: { id: 481, name: 'Хот-дог', stars: 3, modelKey: 'hotdog', imageUrl: 'mock:481' },
  482: { id: 482, name: 'Жена', stars: 2, modelKey: 'woman', imageUrl: 'mock:482' },
  483: { id: 483, name: 'Динозавър', stars: 4, modelKey: 'dino', imageUrl: 'mock:483' },
};

const PLAYERS = {
  HOTDOG: { id: 'mock-0001', username: 'HotDogKing', ageGroup: 'adult', level: 12, skin: SKINS[481], skins: [SKINS[481], SKINS[482]], hex: 18450, labpass: { active: true, until: '2027-01-04' }, perks: [{ type: 'hex_multiplier', value: 2 }] },
  WOMAN1: { id: 'mock-0002', username: 'Marinka_77', ageGroup: 'teen', level: 5, skin: SKINS[482], skins: [SKINS[482]], hex: 3200, labpass: { active: false, until: null }, perks: [] },
  KID001: { id: 'mock-0003', username: 'LittleDino', ageGroup: 'kid', level: 2, skin: SKINS[483], skins: [SKINS[483]], hex: 120, labpass: { active: false, until: null }, perks: [] },
};

export function createMock({ now = Date.now } = {}) {
  const grants = new Map();     // ref → the answer given (idempotent)
  const dayHex = new Map();     // `${playerId}:${YYYY-MM-DD}` → HEX paid that day
  const totals = new Map();     // playerId → HEX balance

  function scan(code) {
    if (code === 'BANNED') return { ok: false, error: 'banned' };
    if (code === 'EXPIRE') return { ok: false, error: 'code_expired' };
    if (code === 'USED01') return { ok: false, error: 'code_used' };
    const p = PLAYERS[code];
    if (!p) return { ok: false, error: 'code_unknown' };
    return { ok: true, player: JSON.parse(JSON.stringify({ ...p, hex: totals.get(p.id) ?? p.hex })) };
  }

  function result(body) {
    if (!body || !body.ref || !body.playerId) return { ok: false, error: 'bad_request' };
    if (grants.has(body.ref)) return grants.get(body.ref);
    const win = body.teamWon === true || (Number(body.placement) >= 1 && Number(body.placement) <= 3);
    const want = 50 + (win ? 50 : 0);
    const day = new Date(now()).toISOString().slice(0, 10);
    const key = `${body.playerId}:${day}`;
    const paid = dayHex.get(key) || 0;
    const hex = Math.max(0, Math.min(want, 300 - paid));
    dayHex.set(key, paid + hex);
    const base = Object.values(PLAYERS).find(p => p.id === body.playerId)?.hex ?? 0;
    const total = (totals.get(body.playerId) ?? base) + hex;
    totals.set(body.playerId, total);
    const answer = { ok: true, hex, capped: hex < want, total };
    grants.set(body.ref, answer);
    return answer;
  }

  /** HEX sent by hand: no daily game cap here (LabCoin decides that), idempotent by ref. */
  function grant(body) {
    if (!body || !body.ref || !body.playerId || !(Number(body.hex) >= 1)) return { ok: false, error: 'bad_request' };
    if (grants.has(body.ref)) return grants.get(body.ref);
    const base = Object.values(PLAYERS).find(p => p.id === body.playerId)?.hex ?? 0;
    const total = (totals.get(body.playerId) ?? base) + Math.round(Number(body.hex));
    totals.set(body.playerId, total);
    const answer = { ok: true, hex: Math.round(Number(body.hex)), total };
    grants.set(body.ref, answer);
    return answer;
  }

  return { scan, result, grant };
}

/** A small flat picture for a mock skin: nothing is fetched, nothing is copied from anywhere. */
export function mockSkinSvg(id) {
  const frame = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="22" fill="${bg}"/>${inner}</svg>`;
  switch (String(id)) {
    case '481': return frame(
      '<rect x="14" y="44" width="100" height="44" rx="22" fill="#e9b872"/><rect x="10" y="52" width="108" height="24" rx="12" fill="#c8402e"/>'
      + '<path d="M18 64 l12 -9 l12 9 l12 -9 l12 9 l12 -9 l12 9 l12 -9" fill="none" stroke="#f2c230" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>', '#3b2a1c');
    case '482': return frame('<circle cx="64" cy="48" r="20" fill="#f1c9a5"/><path d="M28 112 q0 -38 36 -38 q36 0 36 38 z" fill="#a259f0"/><path d="M44 44 q20 -30 40 0 q-6 -14 -20 -14 q-14 0 -20 14" fill="#4a2c1a"/>', '#26324a');
    case '483': return frame('<path d="M24 96 q-4 -40 28 -48 q8 -22 30 -14 l18 -4 l-4 16 q10 14 -2 50 z" fill="#2fbf71"/><circle cx="80" cy="46" r="4" fill="#0e1a12"/><path d="M30 92 l10 -14 l8 14 l10 -14 l8 14" fill="none" stroke="#f3f3f3" stroke-width="4" stroke-linejoin="round"/>', '#14261c');
    default: return frame(`<text x="64" y="82" font-family="sans-serif" font-size="56" font-weight="800" text-anchor="middle" fill="#eef0e8">${String(id).slice(0, 2).replace(/[^\w]/g, '')}</text>`, '#26302a');
  }
}
