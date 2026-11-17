# Публичен лидерборд (QR)

Отделен Cloudflare Worker `labcoin-arena-lb`. **Не е** сайтът и **не е** панелът на VR Varna.
Разрешение от Митко 12.11.2026: „za qr koda imash pozvolenie“.

- **Адрес:** https://labcoin-arena-lb.dimitarkucarov05.workers.dev/lb/<publicId>
  - `publicId` = първото име + 12 случайни знака. Всеки рожден ден има свой адрес и чужди не могат да се изреждат.
- **Посетители:** само четене. Пускат се само `GET /lb/<id>` и `GET /api/lb/<id>`. POST дава 405, а PUT и DELETE без ключ дават 401.
- **Писане:** само приложението в залата, с `PUT /api/lb/<id>` и `Authorization: Bearer <PUBLISH_KEY>`.
  - Ключът е тайна в Cloudflare и в `app/config.json` (`publishKey`), само на компютъра в залата.
- **Данни:** само първото име на рожденика („Рожденият ден на Ивчо“), никнеймите, местата и точките.
  - Worker-ът сам изрязва фамилия, телефон, имейл и всичко друго.
  - Пазят се ~13 месеца (KV `<KV_NAMESPACE_ID>`).
- **Търсачки:** `noindex` + `robots.txt Disallow: /`.
- **Качване:** `cd public-lb && ~/Desktop/VR-VARNA-PANEL/node_modules/.bin/wrangler deploy`
