"""MS Games VR app: the server side. Run with the path of server.js (staging or live).
- The real certificate (data/tls/domain, Let's Encrypt via tools/acme.mjs) for its own name, picked by SNI;
  the self-signed one stays for raw IP addresses. A renewed certificate is picked up without a restart.
- HTTPS on 443 as well (the headset app opens https://arena.osmantush.com/play/), if the port is free.
- /.well-known/assetlinks.json: the headset app bg.arena.vr (same key as Arena.apk) may show this site full screen.
- .webmanifest MIME."""
import io, sys

p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("""  try { return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }; } catch { return null; }
}
const tls = process.env.NO_TLS === '1' ? null : ensureTls();
const secureServer = tls ? https.createServer(tls, (req, res) => server.emit('request', req, res)) : null;""",
"""  try { return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile), SNICallback: domainSni }; } catch { return null; }
}
// Истинският сертификат за името на залата (arena.osmantush.com, от tools/acme.mjs): дава се, когато каската пита
// по име; по IP адрес остава самоподписаният. Подновеният файл се взима без рестарт (гледа се датата на файла).
const DOMAIN_DIR = path.join(TLS_DIR, 'domain');
let domainCtx = null, domainStamp = '';
function domainTls() {
  try {
    const name = fs.readFileSync(path.join(DOMAIN_DIR, 'domain.txt'), 'utf8').trim();
    const chain = path.join(DOMAIN_DIR, 'fullchain.pem'), key = path.join(DOMAIN_DIR, 'key.pem');
    const stamp = name + fs.statSync(chain).mtimeMs + fs.statSync(key).mtimeMs;
    if (stamp !== domainStamp) {
      domainStamp = stamp;
      domainCtx = { name, ctx: tlsMod.createSecureContext({ key: fs.readFileSync(key), cert: fs.readFileSync(chain) }) };
    }
    return domainCtx;
  } catch { return null; }
}
function domainSni(servername, cb) {
  const d = domainTls();
  cb(null, d && servername && servername.toLowerCase() === d.name ? d.ctx : undefined);
}
const tls = process.env.NO_TLS === '1' ? null : ensureTls();
const secureServer = tls ? https.createServer(tls, (req, res) => server.emit('request', req, res)) : null;
// Приложението на каската (MS Games VR) отваря https://<името>/play/ без порт: същото и на 443, ако е свободен.
const appServer = tls && domainTls() && process.env.ARENA_DEV !== '1' && process.env.NO_APP_PORT !== '1'
  ? https.createServer(tls, (req, res) => server.emit('request', req, res)) : null;
if (appServer) {
  appServer.on('upgrade', (req, socket, head) => server.emit('upgrade', req, socket, head));
  appServer.on('error', err => console.warn('HTTPS на 443 не тръгна:', err.message));
}""")

rep("import https from 'node:https';", "import https from 'node:https';\nimport tlsMod from 'node:tls';")

rep("""    const handler = api[`${req.method} ${url.pathname}`];
    if (handler) {""",
"""    // Приложението MS Games VR (bg.arena.vr, подписано с ключа на Arena.apk) може да показва сайта на цял екран.
    // Отпечатъкът е на tools/apk/debug.keystore; друг ключ: data/assetlinks.json го заменя.
    if (url.pathname === '/.well-known/assetlinks.json') {
      let body = null;
      try { body = fs.readFileSync(path.join(DATA, 'assetlinks.json')); } catch { /* по подразбиране */ }
      if (!body) body = JSON.stringify(['bg.arena.vr', 'bg.arena.play'].map(pkg => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [APP_CERT_SHA256] },
      })));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      return res.end(body);
    }

    const handler = api[`${req.method} ${url.pathname}`];
    if (handler) {""")

rep("const TLS_DIR = path.join(DATA, 'tls');",
    "const TLS_DIR = path.join(DATA, 'tls');\n"
    "const APP_CERT_SHA256 = '03:4F:2F:92:25:03:0F:46:51:AE:B9:DE:9A:2E:42:71:CC:5C:0D:B8:2A:3F:60:44:6F:D6:D2:C5:A9:89:3A:B3';   // tools/apk/debug.keystore")

rep("'.ico': 'image/x-icon',", "'.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',")

rep("""if (secureServer) {
  secureServer.listen(TLS_PORT, () => {""",
"""if (appServer) appServer.listen(443, () => console.log(`MS Games VR app: https://${domainTls().name}/play/`));
if (secureServer) {
  secureServer.listen(TLS_PORT, () => {""")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('server patched:', p)
