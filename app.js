(() => {
  'use strict';
  const categories = [
    { id: 'platform', title: '平台动态', en: 'PLATFORMS' },
    { id: 'logistics', title: '物流与供应链', en: 'LOGISTICS & SUPPLY CHAIN' },
    { id: 'policy', title: '合规与政策', en: 'POLICY & COMPLIANCE' },
    { id: 'market', title: '市场与行业趋势', en: 'MARKET & INDUSTRY' },
  ];
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const state = { editions: [], current: null, request: 0, toastTimer: null };
  const localPreview = location.protocol === 'file:';
  const bootstrap = localPreview && $('edition-bootstrap') ? JSON.parse($('edition-bootstrap').textContent) : null;
  function localTime(iso) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)); }
  function notice(message) { $('report-notice').textContent = message; $('report-notice').hidden = !message; }
  function renderContents(report) {
    $('contents').replaceChildren();
    categories.forEach((cat, index) => {
      const a = el('a', index === 0 ? 'active' : ''); a.href = `#${cat.id}`;
      const label = el('span'); label.append(el('b', '', String(index + 1).padStart(2, '0')), document.createTextNode(cat.title));
      a.append(label, el('span', 'nav-count', report ? String(report.categories.find(c => c.id === cat.id).items.length).padStart(2, '0') : '—'));
      a.addEventListener('click', () => { document.querySelectorAll('.contents a').forEach(x => x.classList.toggle('active', x === a)); });
      $('contents').append(a);
    });
  }
  function renderSections(report, failure = false) {
    $('news-sections').replaceChildren();
    categories.forEach((cat, index) => {
      const section = el('section', 'news-section'); section.id = cat.id;
      const heading = el('div', 'category-heading'); const h = el('h3'); h.append(el('span', 'category-number', String(index + 1).padStart(2, '0')), document.createTextNode(cat.title)); heading.append(h, el('span', 'category-en', cat.en)); section.append(heading);
      const data = report?.categories.find(c => c.id === cat.id);
      if (!data?.items.length) {
        const message = failure ? '内容暂时无法载入，请稍后刷新重试。' : !report ? '首期日报尚未发布，发布后将在此显示。' : data.status === 'unavailable' ? '本板块检索未完成，暂不作“无重要更新”的判断。' : '最近24小时暂无经核实的重要更新。';
        section.append(el('div', 'category-empty', message));
      } else data.items.forEach(item => {
        const card = el('article', 'news-card'); card.id = item.id;
        const meta = el('div', 'card-meta'); meta.append(el('span', 'source-type', item.sourceType === 'official' ? '官方来源' : '媒体报道'), el('span', '', item.source), el('span', 'meta-separator', '·'), el('span', '', `${item.publishedAt.slice(0, 10)} ${item.publishedAt.slice(11, 16)} ${item.sourceTimezone}`));
        card.append(meta, el('h4', '', item.title), el('p', 'news-summary', item.summary), el('p', 'card-subjects', `涉及主体：${item.subjects.join('、')}`));
        const footer = el('div', 'card-footer'); const original = el('a', 'original-link', '阅读原文 ↗'); original.href = item.url; original.target = '_blank'; original.rel = 'noopener noreferrer'; original.append(el('span', 'original-url', item.url));
        const permalink = el('a', 'permalink', '本条链接 ↗'); permalink.href = `?date=${encodeURIComponent(report.date)}#${encodeURIComponent(item.id)}`;
        footer.append(original, permalink); card.append(footer); section.append(card);
      });
      $('news-sections').append(section);
    });
    $('news-sections').setAttribute('aria-busy', 'false');
  }
  function renderReport(report) {
    state.current = report;
    const total = report.categories.reduce((n, c) => n + c.items.length, 0);
    $('edition-date').textContent = report.date.replaceAll('-', '.');
    $('edition-weekday').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date(`${report.date}T12:00:00+08:00`));
    $('monitor-window').textContent = `${localTime(report.window.start)} 至 ${localTime(report.window.end)} · 北京时间`;
    $('status-dot').classList.toggle('published', report.status === 'complete');
    $('total-count').textContent = `${total} 条`;
    document.title = `${report.date} · YunShip每日跨境速报`;
    notice(report.status === 'partial' ? `本期为部分检索结果。${report.limitations}` : '');
    $('latest-button').hidden = report.date === state.editions[0]?.date;
    renderContents(report); renderSections(report);
    $('source-overview').hidden = false;
    const items = report.categories.flatMap(c => c.items);
    const official = items.filter(i => i.sourceType === 'official').length;
    const summary = el('p', '', `本期纳入 ${total} 条新闻，其中官方来源 ${official} 条、媒体来源 ${total - official} 条。`);
    const counts = el('p', '', categories.map(c => `${c.title} ${report.categories.find(x => x.id === c.id).items.length} 条`).join(' · '));
    const tags = el('div', 'source-tags'); [...new Set(items.map(i => i.source))].forEach(source => tags.append(el('span', '', source)));
    $('source-summary').replaceChildren(summary, counts, tags);
    document.querySelectorAll('.archive-item').forEach(a => a.classList.toggle('active', a.dataset.date === report.date));
  }
  async function selectEdition(date, updateAddress = false) {
    const entry = state.editions.find(e => e.date === date);
    if (!entry) throw new Error('此日期的日报未发布。');
    const request = ++state.request;
    $('news-sections').setAttribute('aria-busy', 'true');
    let report;
    if (bootstrap) report = bootstrap.reports.find(r => r.date === date);
    else { const response = await fetch(entry.path, { cache: 'no-store' }); if (!response.ok) throw new Error('日报读取失败。'); report = await response.json(); }
    if (request !== state.request) return;
    if (report.date !== entry.date) throw new Error('日报日期与目录不一致。');
    $('edition-select').value = date;
    if (updateAddress) { const url = new URL(location.href); url.searchParams.set('date', date); url.hash = ''; history.pushState(null, '', url); }
    renderReport(report);
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }
  function showToast(message) { clearTimeout(state.toastTimer); $('toast').textContent = message; $('toast').hidden = false; state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
  async function share() {
    if (localPreview || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) { showToast('这是本地预览，公开上线后才能分享。'); return; }
    if (!state.current) { showToast('首期日报尚未发布。'); return; }
    const url = new URL(location.href); url.search = ''; url.searchParams.set('date', state.current.date); url.hash = '';
    try { await navigator.clipboard.writeText(url.href); showToast('本期日报链接已复制。'); }
    catch { $('share-url').value = url.href; $('share-dialog').showModal(); $('share-url').select(); }
  }
  function showFailure(error) {
    notice(`日报暂时无法读取：${error.message} 请刷新页面重试。`);
    $('monitor-window').textContent = '日报读取失败'; $('total-count').textContent = '— 条';
    $('source-overview').hidden = true; renderContents(null); renderSections(null, true);
  }
  $('share-top').addEventListener('click', share);
  $('edition-select').addEventListener('change', () => selectEdition($('edition-select').value, true).catch(showFailure));
  $('latest-button').addEventListener('click', () => selectEdition(state.editions[0].date, true).catch(showFailure));
  window.addEventListener('popstate', () => { const date = new URLSearchParams(location.search).get('date') || state.editions[0]?.date; if (date) selectEdition(date).catch(showFailure); });
  async function init() {
    renderContents(null);
    try {
      let index;
      if (bootstrap) index = bootstrap.index;
      else { const response = await fetch('./data/index.json', { cache: 'no-store' }); if (!response.ok) throw new Error('日报目录读取失败。'); index = await response.json(); }
      state.editions = index.editions;
      if (!state.editions.length) {
        $('edition-date').textContent = '待发布'; $('edition-weekday').textContent = '尚无已发布日报'; $('monitor-window').textContent = '首期日报待生成 · 时间口径：北京时间'; $('total-count').textContent = '待发布';
        notice('当前尚无已发布日报。页面不会将未完成的检索显示为“暂无重要更新”。'); renderSections(null); return;
      }
      $('edition-select').replaceChildren(); $('archive-list').replaceChildren(); $('edition-select').disabled = false;
      for (const entry of state.editions) {
        const option = el('option', '', `${entry.date} · ${entry.total}条`); option.value = entry.date; $('edition-select').append(option);
        const link = el('a', 'archive-item'); link.href = `?date=${entry.date}`; link.dataset.date = entry.date;
        const label = el('span', '', entry.date); label.append(el('small', '', `${entry.total}条新闻${entry.status === 'partial' ? ' · 部分检索' : ''}`)); link.append(label, el('span', '', '↗'));
        link.addEventListener('click', event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); selectEdition(entry.date, true).then(() => $('main').scrollIntoView()).catch(showFailure); });
        $('archive-list').append(link);
      }
      const requested = new URLSearchParams(location.search).get('date');
      if (requested && !state.editions.some(e => e.date === requested)) { showFailure(new Error('该日期尚无已发布日报')); return; }
      await selectEdition(requested || state.editions[0].date);
    } catch (error) { showFailure(error); }
  }
  init();
})();
