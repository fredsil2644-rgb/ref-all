(() => {
  const body = document.body;
  const root = body.dataset.root || '';
  const page = body.dataset.page;
  const ACCENTS = ['#e76f51', '#2a9d8f', '#f1c75b', '#457b9d', '#8d6a9f', '#d1495b'];
  const PAGE_SIZE = 60;
  const accent = i => ACCENTS[i % ACCENTS.length];
  const fmtPrice = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const fmtNum = new Intl.NumberFormat('pt-PT');
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register(root + 'sw.js').catch(() => {});
  }
  const status = $('offline-status');
  const setStatus = () => { if (status) status.textContent = navigator.onLine ? '' : 'Modo offline'; };
  addEventListener('online', setStatus); addEventListener('offline', setStatus); setStatus();

  const getJson = name => fetch(root + 'data/' + name).then(r => r.json());

  async function initCategories() {
    const { total, cats } = await getJson('categorias.json');
    const stats = $('stats');
    if (stats) stats.innerHTML = `<div><dt>Artigos</dt><dd>${fmtNum.format(total)}</dd></div><div><dt>Categorias</dt><dd>${cats.length}</dd></div>`;
    const grid = $('cat-grid');
    const limit = Number(grid.dataset.limit) || cats.length;
    const draw = list => {
      grid.innerHTML = list.slice(0, limit).map(({ c, i }) => `<a class="cat-card" style="--accent:${accent(i)}" href="${root}categoria/${c.slug}.html">
        <div><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p></div>
        <div class="meta"><span>${fmtNum.format(c.count)} artigos</span><span class="arrow" aria-hidden="true">↗</span></div></a>`).join('');
    };
    const all = cats.map((c, i) => ({ c, i, key: norm(c.name + ' ' + c.desc) }));
    draw(all);
    const input = $('catq');
    if (input) {
      const out = $('catcount');
      const run = () => {
        const terms = norm(input.value).split(/\s+/).filter(Boolean);
        const res = all.filter(x => terms.every(t => x.key.includes(t)));
        out.textContent = `${fmtNum.format(res.length)} categorias`;
        draw(res);
      };
      input.addEventListener('input', run);
      run();
    }
  }

  async function initList() {
    const data = await getJson('artigos.json');
    const cats = data.cats;
    const fixedCat = body.dataset.cat === undefined ? null : Number(body.dataset.cat);
    const items = data.items.map(it => ({ code: it[0], desc: it[1], cat: it[2], qty: it[3], price: it[4], consign: !!(it[5] & 1), disc: !!(it[5] & 2), key: norm(it[0] + ' ' + it[1]) }));
    const q = $('q'), sort = $('sort'), stockOnly = $('stockonly'), disc = $('disc'), catFilter = $('catfilter');
    const list = $('list'), count = $('count'), empty = $('empty'), more = $('more'), dialog = $('detail');
    let result = [], shown = 0;

    if (catFilter) {
      catFilter.insertAdjacentHTML('beforeend', cats.map((c, i) => `<option value="${i}">${esc(c[1])}</option>`).join(''));
      const initial = new URLSearchParams(location.search).get('cat');
      if (initial !== null && cats[initial]) catFilter.value = initial;
    }

    const sorters = {
      code: (a, b) => a.code.localeCompare(b.code, 'pt', { numeric: true }),
      desc: (a, b) => a.desc.localeCompare(b.desc, 'pt', { numeric: true }),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'stock-desc': (a, b) => b.qty - a.qty
    };

    function card(it, i) {
      return `<button class="card" style="--accent:${accent(it.cat)}" data-i="${i}">
        <span class="code">${esc(it.code)}</span>
        <span class="desc">${esc(it.desc)}</span>
        <span class="row"><span class="${it.qty > 0 ? '' : 'out'}">${it.qty > 0 ? 'Stock ' + fmtNum.format(it.qty) : 'Sem stock'}</span><span class="price">${fmtPrice.format(it.price)}</span></span>
        ${it.disc ? '<span class="tag">Descontinuado</span>' : ''}</button>`;
    }

    function renderMore(reset) {
      if (reset) { list.innerHTML = ''; shown = 0; }
      const next = result.slice(shown, shown + PAGE_SIZE);
      list.insertAdjacentHTML('beforeend', next.map((it, k) => card(it, shown + k)).join(''));
      shown += next.length;
      more.hidden = shown >= result.length;
    }

    function update() {
      const terms = norm(q.value).split(/\s+/).filter(Boolean);
      const catValue = fixedCat !== null ? fixedCat : (catFilter && catFilter.value !== '' ? Number(catFilter.value) : null);
      result = items.filter(it =>
        (catValue === null || it.cat === catValue) &&
        (disc.checked || !it.disc) &&
        (!stockOnly.checked || it.qty > 0) &&
        terms.every(t => it.key.includes(t)));
      result.sort(sorters[sort.value]);
      count.textContent = `${fmtNum.format(result.length)} ${result.length === 1 ? 'artigo' : 'artigos'}`;
      empty.hidden = result.length !== 0;
      renderMore(true);
    }

    let timer;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 120); });
    [sort, stockOnly, disc, catFilter].forEach(el => el && el.addEventListener('change', update));
    more.addEventListener('click', () => renderMore(false));
    list.addEventListener('click', e => {
      const btn = e.target.closest('.card');
      if (!btn) return;
      const it = result[Number(btn.dataset.i)];
      dialog.style.setProperty('--accent', accent(it.cat));
      dialog.innerHTML = `<span class="tag">${esc(cats[it.cat][1])}</span>
        <h2>${esc(it.code)}</h2><p>${esc(it.desc)}</p>
        <dl><dt>Preço unitário</dt><dd>${fmtPrice.format(it.price)}</dd>
        <dt>Stock</dt><dd>${fmtNum.format(it.qty)}</dd>
        <dt>Armazém</dt><dd>${it.consign ? 'Consignação' : 'Principal'}</dd>
        <dt>Estado</dt><dd>${it.disc ? 'Descontinuado' : 'Ativo'}</dd></dl>
        <form method="dialog"><a class="btn" href="${root}categoria/${cats[it.cat][0]}.html">Ver categoria</a><button class="btn primary">Fechar</button></form>`;
      dialog.showModal();
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    update();
  }

  if (page === 'home' || page === 'categorias') initCategories();
  if (page === 'artigos' || page === 'categoria') initList();
})();
