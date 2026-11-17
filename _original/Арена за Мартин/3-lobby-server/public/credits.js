// Раздел „Кредити“: чете статичния credits.json (копие на CREDITS.md, без вътрешните колони).
(function () {
  const box = document.getElementById('creditsBody');
  if (!box) return;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const link = (href, text) => {
    const a = el('a', null, text);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  };
  // текстът на кредита с работещи линкове
  function withLinks(parent, text) {
    let at = 0;
    for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
      parent.append(text.slice(at, m.index), link(m[0], m[0]));
      at = m.index + m[0].length;
    }
    parent.append(text.slice(at));
    return parent;
  }
  function author(i) {
    const td = el('td');
    if (i.authorLink) td.append(link(i.authorLink, i.author)); else td.textContent = i.author;
    return td;
  }
  function row(i) {
    const tr = el('tr');
    tr.append(el('td', null, i.material), author(i), el('td', null, i.license));
    const src = el('td');
    if (i.link) src.append(link(i.link, 'Източник')); else src.textContent = '—';
    tr.append(src);
    return tr;
  }
  function render(items) {
    box.textContent = '';
    const must = items.filter(i => i.required);
    if (must.length) {
      box.append(el('h3', 'credits-h', 'Задължителни кредити (CC-BY)'));
      for (const i of must) box.append(withLinks(el('p', 'credits-must'), i.credit.replace(/^ЗАДЪЛЖИТЕЛЕН:\s*/, '')));
    }
    const notes = items.filter(i => i.notice);
    if (notes.length) {
      box.append(el('h3', 'credits-h', 'Лицензни бележки (MIT)'));
      for (const i of notes) box.append(withLinks(el('p', 'credits-must credits-note'), i.notice));
    }
    box.append(el('h3', 'credits-h', `Всички материали (${items.length})`));
    const table = el('table', 'credits-table');
    const head = el('tr');
    for (const t of ['Материал', 'Автор', 'Лиценз', 'Линк']) head.append(el('th', null, t));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const i of items) tbody.append(row(i));
    table.append(thead, tbody);
    box.append(table);
  }
  fetch('credits.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => render(d.items || []))
    .catch(() => { box.textContent = 'Кредитите не се заредиха (credits.json).'; });
})();
