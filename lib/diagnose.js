// Diagnose page and firewall (design section 8). The checks are built from plain inputs so they can be tested; the
// server gathers the inputs (ping, netsh, adb) with exec(file, args) → Promise<{ ok, out, err }>.
//
// Check: { id, group: 'pc'|'network'|'headset', headsetId?, label, ok: true|false|null, level: 'ok'|'warn'|'error'|'info', value, text, fix? }
//   text = one sentence of what to do when it is not ok.

export const FIREWALL_RULES = { tcp: 'MS Games (TCP)', udp: 'MS Games (UDP)' };

export const ROUTER_CHECKLIST = [
  'Use the 5 GHz band for the headsets, one network name (SSID) for all of them.',
  'Connect this PC to the router with a cable, not over Wi-Fi.',
  'Keep the router in the play area or right next to it, up high, with nothing metal in front.',
  'Turn off band steering / smart connect if headsets keep jumping between 2.4 and 5 GHz.',
  'Give this PC a fixed address (DHCP reservation) so the headsets always find it.',
];

/** Windows `ping -n 1` (any language: the number before "ms") or Android `ping -c 1` ("time=12.3 ms"). */
export function parsePingMs(text) {
  const s = String(text || '');
  let m = /time[=<]\s*([\d.]+)\s*ms/i.exec(s) || /[=<]\s*([\d.]+)\s*ms\b/i.exec(s) || /\b([\d.]+)\s*ms\b/i.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.max(1, Math.round(v)) : null;
}

/** Output of `netsh advfirewall firewall show rule name=...` → is there an enabled inbound allow rule? */
export function firewallRuleOk(text) {
  const s = String(text || '');
  if (!/Rule Name|Име на правило|Enabled/i.test(s)) return false;
  const enabled = /Enabled:\s*Yes/i.test(s) || /Активирано:\s*Да/i.test(s);
  const allow = /Action:\s*Allow/i.test(s) || /Действие:\s*Разрешаване/i.test(s);
  return enabled && allow;
}

/** The elevated command that (re)creates both inbound rules for node.exe. Runs once behind a UAC prompt. */
export function firewallFixCommand({ node, ports = [47801, 47843], udp = [47810] }) {
  const q = s => `"${s}"`;
  const cmds = [
    `netsh advfirewall firewall delete rule name=${q(FIREWALL_RULES.tcp)}`,
    `netsh advfirewall firewall delete rule name=${q(FIREWALL_RULES.udp)}`,
    `netsh advfirewall firewall add rule name=${q(FIREWALL_RULES.tcp)} dir=in action=allow program=${q(node)} protocol=TCP localport=${ports.join(',')} enable=yes profile=any`,
    `netsh advfirewall firewall add rule name=${q(FIREWALL_RULES.udp)} dir=in action=allow program=${q(node)} protocol=UDP localport=${udp.join(',')} enable=yes profile=any`,
  ].join(' & ');
  // PowerShell asks Windows for elevation (UAC); cmd runs the four netsh lines
  const ps = `Start-Process -FilePath cmd.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '/c ${cmds.replace(/'/g, "''")}'`;
  return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', ps], cmds };
}

export async function firewallStatus(exec) {
  const tcp = await exec('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULES.tcp}`]);
  const udp = await exec('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULES.udp}`]);
  return { tcp: firewallRuleOk(tcp.out), udp: firewallRuleOk(udp.out), available: !(/not recognized|ENOENT/i.test(tcp.err || '')) };
}

const item = (o) => ({ ok: null, level: 'info', value: null, text: '', ...o });

/**
 * inputs: { addresses:[ip], chosen, version, pageBuild, firewall:{tcp, udp, available}, headsets:[{ id, name, online, ip, wsPingMs,
 *   pcPingMs, backPingMs, build, appVersion, battery, charging, lastDropAt, drops, desk }], adb: bool }
 */
export function buildChecks(inp) {
  const out = [];
  out.push(item({ id: 'pc.addresses', group: 'pc', label: 'PC addresses', ok: inp.addresses.length > 0, level: inp.addresses.length ? 'ok' : 'error',
    value: inp.addresses.join(', ') || 'none', text: inp.addresses.length ? '' : 'This PC has no network address: plug in the network cable or join the Wi-Fi.' }));
  out.push(item({ id: 'pc.adapter', group: 'pc', label: 'Adapter the headsets use', ok: !!inp.chosen, level: inp.chosen ? 'ok' : 'warn', value: inp.chosen || 'none',
    text: inp.chosen ? '' : 'No home-network address (192.168.x.x): check that the PC is on the same network as the headsets.' }));
  if (inp.addresses.length > 1) out.push(item({ id: 'pc.multi', group: 'pc', label: 'Several networks', ok: null, level: 'info', value: `${inp.addresses.length}`,
    text: 'This PC is on more than one network: headsets must be on the one shown above.' }));
  out.push(item({ id: 'pc.version', group: 'pc', label: 'MS Games version', ok: true, level: 'ok', value: `${inp.version} · page build ${inp.pageBuild}` }));
  const fw = inp.firewall || {};
  if (fw.available === false) out.push(item({ id: 'pc.firewall', group: 'pc', label: 'Firewall rule', ok: null, level: 'info', value: 'cannot check', text: 'Windows firewall tools are not available here.' }));
  else {
    const ok = !!(fw.tcp && fw.udp);
    out.push(item({ id: 'pc.firewall', group: 'pc', label: 'Firewall rule', ok, level: ok ? 'ok' : 'error', value: ok ? 'present' : `${fw.tcp ? '' : 'TCP missing '}${fw.udp ? '' : 'UDP missing'}`.trim(),
      text: ok ? '' : 'Headsets cannot reach this PC through the Windows firewall: press Fix and allow the prompt.', fix: ok ? undefined : 'firewall' }));
  }
  if (inp.adb === false) out.push(item({ id: 'pc.adb', group: 'pc', label: 'Android tools (adb)', ok: null, level: 'info', value: 'not found', text: 'Without adb the PC cannot ping back from headsets or install over USB.' }));

  for (const h of inp.headsets) {
    const g = { group: 'headset', headsetId: h.id };
    const name = h.name || h.id;
    if (!h.online) {
      out.push(item({ ...g, id: `hs.${h.id}.online`, label: `${name}: connected`, ok: false, level: 'error', value: h.lastDropAt ? `last seen ${h.lastDropAt}` : 'offline',
        text: 'Put the headset on, check it is on the same Wi-Fi, and open MS Games in it.' }));
      continue;
    }
    if (h.desk) continue;
    const ws = h.wsPingMs;
    out.push(item({ ...g, id: `hs.${h.id}.link`, label: `${name}: link ping`, ok: ws == null ? null : ws < 80, level: ws == null ? 'info' : ws < 80 ? 'ok' : ws < 200 ? 'warn' : 'error',
      value: ws == null ? 'measuring' : `${ws} ms`, text: ws != null && ws >= 80 ? 'Slow link: move the router closer, use 5 GHz, keep other devices off this Wi-Fi.' : '' }));
    out.push(item({ ...g, id: `hs.${h.id}.pcping`, label: `${name}: ping from PC`, ok: h.pcPingMs == null ? false : h.pcPingMs < 100, level: h.pcPingMs == null ? 'warn' : h.pcPingMs < 100 ? 'ok' : 'warn',
      value: h.pcPingMs == null ? 'no answer' : `${h.pcPingMs} ms`, text: h.pcPingMs == null ? 'The headset does not answer pings: it may be asleep, or the router blocks devices from seeing each other (client isolation).' : '' }));
    if (h.backPingMs !== undefined) out.push(item({ ...g, id: `hs.${h.id}.backping`, label: `${name}: ping to PC`, ok: h.backPingMs != null, level: h.backPingMs != null ? 'ok' : 'warn',
      value: h.backPingMs == null ? 'no answer' : `${h.backPingMs} ms`, text: h.backPingMs == null ? 'The headset cannot reach this PC: check the firewall rule and that both are on the same network.' : '' }));
    const old = h.build && inp.pageBuild && h.build < inp.pageBuild;
    out.push(item({ ...g, id: `hs.${h.id}.build`, label: `${name}: page version`, ok: !old, level: old ? 'warn' : 'ok', value: `${h.build || '?'}${h.appVersion ? ` · app ${h.appVersion}` : ''}`,
      text: old ? 'The headset shows an old page: use Reload page on its card.' : '' }));
    if (typeof h.battery === 'number') out.push(item({ ...g, id: `hs.${h.id}.battery`, label: `${name}: battery`, ok: h.battery >= 20 || !!h.charging, level: h.battery >= 20 || h.charging ? 'ok' : 'warn',
      value: `${h.battery} %${h.charging ? ' charging' : ''}`, text: h.battery < 20 && !h.charging ? 'Charge this headset or swap it before the next game.' : '' }));
    if (h.drops) out.push(item({ ...g, id: `hs.${h.id}.drops`, label: `${name}: drops (30 min)`, ok: h.drops < 3, level: h.drops < 3 ? 'info' : 'warn', value: `${h.drops}${h.lastDropAt ? `, last ${h.lastDropAt}` : ''}`,
      text: h.drops >= 3 ? 'This headset keeps losing the Wi-Fi: check the router position and the 5 GHz signal where it plays.' : '' }));
  }
  const bad = out.filter(c => c.ok === false);
  return { checks: out, summary: { errors: bad.filter(c => c.level === 'error').length, warnings: out.filter(c => c.level === 'warn').length }, router: ROUTER_CHECKLIST };
}
