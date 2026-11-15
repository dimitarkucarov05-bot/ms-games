// A real certificate for the arena's own address (Let's Encrypt, ACME v2, DNS-01 check), without any library.
//
//   node tools/acme.mjs start  [domain]   account + order; prints the TXT record to add: _acme-challenge.<domain>
//   node tools/acme.mjs finish [domain]   once the TXT record is visible: the check, the certificate, saved to
//                                          data/tls/domain/fullchain.pem and key.pem (the server uses them at its next start)
//   node tools/acme.mjs status            what is saved, and when the certificate runs out
//
// --staging uses Let's Encrypt's test service (certificates browsers do not trust), for trying the steps.
// The state between the two steps is in data/tls/acme-state.json. The account key is data/tls/acme-account.pem.
// The domain key never leaves this computer. Needs openssl (Git for Windows has one) only to write the CSR.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.ARENA_DATA || path.join(HERE, '..', 'data');
const TLS = path.join(DATA, 'tls'), OUT = path.join(TLS, 'domain');
const STATE = path.join(TLS, 'acme-state.json'), ACCOUNT = path.join(TLS, 'acme-account.pem');
const args = process.argv.slice(2), cmd = args[0] || 'status';
const staging = args.includes('--staging');
const domain = args.find((a, i) => i > 0 && !a.startsWith('--')) || 'arena.osmantush.com';
const DIR = staging ? 'https://acme-staging-v02.api.letsencrypt.org/directory' : 'https://acme-v02.api.letsencrypt.org/directory';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const OPENSSL = ['openssl', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'C:/Program Files/Git/usr/bin/openssl.exe'];

function accountKey() {
  fs.mkdirSync(TLS, { recursive: true });
  if (!fs.existsSync(ACCOUNT)) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    fs.writeFileSync(ACCOUNT, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  return crypto.createPrivateKey(fs.readFileSync(ACCOUNT));
}
function jwkOf(key) { const j = crypto.createPublicKey(key).export({ format: 'jwk' }); return { crv: j.crv, kty: j.kty, x: j.x, y: j.y }; }
const thumbprint = (jwk) => b64u(crypto.createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest());

let dir = null, nonce = null;
async function directory() { if (!dir) dir = await (await fetch(DIR)).json(); return dir; }
async function newNonce() { const r = await fetch((await directory()).newNonce, { method: 'HEAD' }); return r.headers.get('replay-nonce'); }
/** A signed request (JWS, ES256). payload null = POST-as-GET. */
async function post(url, payload, key, kid) {
  for (let tries = 0; tries < 3; tries++) {
    if (!nonce) nonce = await newNonce();
    const prot = { alg: 'ES256', nonce, url, ...(kid ? { kid } : { jwk: jwkOf(key) }) };
    const p64 = b64u(JSON.stringify(prot)), b64 = payload === null ? '' : b64u(JSON.stringify(payload));
    const sig = crypto.sign('sha256', Buffer.from(`${p64}.${b64}`), { key, dsaEncoding: 'ieee-p1363' });
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/jose+json' }, body: JSON.stringify({ protected: p64, payload: b64, signature: b64u(sig) }) });
    nonce = r.headers.get('replay-nonce');
    const type = r.headers.get('content-type') || '';
    const body = type.includes('json') ? await r.json() : await r.text();
    if (r.status === 400 && body && body.type === 'urn:ietf:params:acme:error:badNonce') continue;
    if (r.status >= 400) throw new Error(`${url}: ${r.status} ${JSON.stringify(body)}`);
    return { status: r.status, headers: r.headers, body };
  }
  throw new Error('no good nonce');
}

async function start() {
  const key = accountKey(), d = await directory();
  const acc = await post(d.newAccount, { termsOfServiceAgreed: true }, key);
  const kid = acc.headers.get('location');
  const ord = await post(d.newOrder, { identifiers: [{ type: 'dns', value: domain }] }, key, kid);
  const order = ord.headers.get('location');
  const az = await post(ord.body.authorizations[0], null, key, kid);
  const ch = az.body.challenges.find((c) => c.type === 'dns-01');
  if (!ch) throw new Error('no dns-01 challenge offered');
  const keyAuth = `${ch.token}.${thumbprint(jwkOf(key))}`;
  const txt = b64u(crypto.createHash('sha256').update(keyAuth).digest());
  fs.writeFileSync(STATE, JSON.stringify({ domain, staging, kid, order, authz: ord.body.authorizations[0], challenge: ch.url, finalize: ord.body.finalize, txt, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ record: `_acme-challenge.${domain}`, type: 'TXT', value: txt }));
}

async function dnsTxt(name) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: 'application/dns-json' } });
  const j = await r.json();
  return (j.Answer || []).map((a) => String(a.data).replace(/^"|"$/g, ''));
}

async function finish() {
  const st = readJson(STATE, null);
  if (!st) throw new Error('run start first');
  if (st.staging && !staging) dir = await (await fetch('https://acme-staging-v02.api.letsencrypt.org/directory')).json();
  const key = accountKey();
  const seen = await dnsTxt(`_acme-challenge.${st.domain}`);
  if (!seen.includes(st.txt)) throw new Error(`the TXT record is not visible yet (seen: ${JSON.stringify(seen)})`);
  await post(st.challenge, {}, key, st.kid);
  for (let i = 0; i < 30; i++) {
    const az = await post(st.authz, null, key, st.kid);
    if (az.body.status === 'valid') break;
    if (az.body.status === 'invalid') throw new Error(`check failed: ${JSON.stringify(az.body.challenges)}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  // the domain key and the request for the certificate
  fs.mkdirSync(OUT, { recursive: true });
  const keyFile = path.join(OUT, 'key.pem'), csrFile = path.join(OUT, 'request.der');
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync(keyFile + '.new', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  let made = false;
  for (const tool of OPENSSL) {
    try { execFileSync(tool, ['req', '-new', '-key', keyFile + '.new', '-subj', `/CN=${st.domain}`, '-addext', `subjectAltName=DNS:${st.domain}`, '-outform', 'DER', '-out', csrFile], { stdio: 'ignore' }); made = true; break; } catch { /* the next one */ }
  }
  if (!made) throw new Error('openssl not found for the CSR');
  await post(st.finalize, { csr: b64u(fs.readFileSync(csrFile)) }, key, st.kid);
  let cert = null;
  for (let i = 0; i < 30 && !cert; i++) {
    const o = await post(st.order, null, key, st.kid);
    if (o.body.status === 'valid' && o.body.certificate) cert = (await post(o.body.certificate, null, key, st.kid)).body;
    else if (o.body.status === 'invalid') throw new Error(`order failed: ${JSON.stringify(o.body)}`);
    else await new Promise((r) => setTimeout(r, 2000));
  }
  if (!cert) throw new Error('no certificate came');
  fs.writeFileSync(path.join(OUT, 'fullchain.pem'), cert);
  fs.renameSync(keyFile + '.new', keyFile);
  fs.writeFileSync(path.join(OUT, 'domain.txt'), st.domain + '\n');
  fs.rmSync(csrFile, { force: true });
  console.log(`saved ${path.join(OUT, 'fullchain.pem')}${st.staging ? ' (staging: not trusted)' : ''}`);
  status();
}

function status() {
  const f = path.join(OUT, 'fullchain.pem');
  if (!fs.existsSync(f)) return console.log('no certificate yet');
  const c = new crypto.X509Certificate(fs.readFileSync(f));
  console.log(JSON.stringify({ subject: c.subject, san: c.subjectAltName, issuer: c.issuer.split('\n').join(', '), validTo: c.validTo }));
}

try {
  if (cmd === 'start') await start();
  else if (cmd === 'finish') await finish();
  else status();
} catch (e) { console.error(e.message); process.exitCode = 1; }
