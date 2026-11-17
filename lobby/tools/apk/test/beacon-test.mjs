// Пробен „сигнал" на сървъра, за когато истинският сървър на играта не е пуснат:
// вика по UDP 47810 на всеки 2 секунди същото съобщение, което търси приложението „Арена".
//
//   node test/beacon-test.mjs            с портове 47801 / 47843
//   node test/beacon-test.mjs 47801 47843
//
// Не слуша на никакъв порт и не пипа сървъра на играта. Спира се с Ctrl+C.
import dgram from 'node:dgram';
import os from 'node:os';

const http = Number(process.argv[2] || 47801);
const https = Number(process.argv[3] || 47843);
const msg = Buffer.from(JSON.stringify({ app: 'arena-play', http, https }));

const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
sock.on('error', err => { console.error('UDP:', err.message); process.exit(1); });
sock.bind(() => {
  sock.setBroadcast(true);
  const targets = () => ['255.255.255.255', ...Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address.replace(/\d+$/, '255'))];
  const send = () => { for (const t of targets()) sock.send(msg, 47810, t, () => {}); };
  send();
  setInterval(send, 2000);
  console.log(`Викам ${msg} към ${targets().join(', ')} на порт 47810`);
});
