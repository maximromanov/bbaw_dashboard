const fmt = {
  int:  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  one:  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
  two:  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
};

const $ = (id) => document.getElementById(id);

// ═══════════════════════════════════════════════════════════
//   Corpus data loading (shared across stats panel + browser)
// ═══════════════════════════════════════════════════════════

const fmtN = (n) => fmt.int.format(n);

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ARABIC_RE = /[؀-ۿݐ-ݿ]/;
const isArabic   = (s) => s != null && ARABIC_RE.test(String(s));
const arClass    = (s) => isArabic(s) ? ' arabic' : '';

// ── Two-tier loading ───────────────────────────────────────
// Tier 1 (boot): fetch the small precomputed summary.json and render
//   Layer 1 (breakdown/histogram/top-N) and Layer 2 (discipline charts).
// Tier 2 (on demand): fetch the full corpus_merged.json and build the
//   MiniSearch index when the user first interacts with the browser
//   (search-box focus, first keystroke, or the panel scrolls into view).

(async function loadSummary() {
  try {
    const response = await fetch('data/summary.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const summary = await response.json();
    initStatsPanel(summary);
    initDisciplineCharts(summary);
    initBrowserPlaceholder(summary);
  } catch (err) {
    console.error('Failed to load summary:', err);
    const msg = `Could not load summary.json (${err.message}). Serve over HTTP — file:// access is blocked by the browser.`;
    $('breakdown-body').innerHTML =
      `<tr><td colspan="6" class="loading-cell">${escapeHtml(msg)}</td></tr>`;
    $('histogram').innerHTML       = `<div class="loading-cell">${escapeHtml(msg)}</div>`;
    $('top-works').innerHTML       = `<li class="loading-cell">${escapeHtml(msg)}</li>`;
    $('top-volumes').innerHTML     = `<li class="loading-cell">${escapeHtml(msg)}</li>`;
    $('b-summary').textContent     = msg;
    $('browse-body').innerHTML     = `<tr><td colspan="7" class="loading-cell">${escapeHtml(msg)}</td></tr>`;
  }
})();

// ═══════════════════════════════════════════════════════════
//   A · Corpus at a glance — stats panel (renders from summary.json)
// ═══════════════════════════════════════════════════════════

// Proposal-canonical collection names. `italic` flags al-Maktaba al-Waqfiyya
// as a transliterated Arabic title (rendered with <em> in HTML contexts; in
// form controls like <option> we rely on CSS to italicize a specific value).
const SOURCE_LABELS = {
  aco:            { text: 'Arabic Collections Online' },
  shamela_ay:     { text: 'ShamelaAY-PDF' },
  waqfeya:        { text: 'al-Maktaba al-Waqfiyya', italic: true },
  personal_other: { text: 'Personal / Other' },
};

function sourceLabelText(src) {
  const l = SOURCE_LABELS[src];
  return l ? l.text : src;
}

function sourceLabelHtml(src) {
  const l = SOURCE_LABELS[src];
  if (!l) return escapeHtml(src);
  return l.italic ? `<em>${escapeHtml(l.text)}</em>` : escapeHtml(l.text);
}

// Sources that count toward the proposal-collection sub-totals shown in
// the per-source breakdown table. Personal/Other is intentionally excluded
// from this view per the proposal's source-collections framing.
const PROPOSAL_SOURCES = ['aco', 'shamela_ay', 'waqfeya'];

function initStatsPanel(summary) {
  renderBreakdownTable(summary.per_source, summary.totals);
  renderHistogram(summary.histogram);
  renderTopWorks(summary.top_works);
  renderTopVolumes(summary.top_volumes);
}

function renderBreakdownTable(perSource /*, totals */) {
  // Show only the proposal collections; Personal/Other is excluded from this
  // view (its records remain searchable in the Title Browser).
  const proposal = perSource.filter((s) => PROPOSAL_SOURCES.includes(s.source));

  const rows = proposal.map((s) => ({
    labelHtml: sourceLabelHtml(s.source),
    vols:      s.records,
    works:     s.works,
    pages:     s.pages,
    avg:       s.avg_pp,
    median:    s.median_pp,
    hasWorks:  s.has_works,
  }));

  // TOTAL sums the visible (proposal-collection) rows.
  const sum = (k) => proposal.reduce((a, s) => a + (s[k] || 0), 0);
  const totalVols  = sum('records');
  const totalWorks = sum('works');
  const totalPages = sum('pages');
  // Per-row "avg pp" excludes zero-page records (matches summary.json semantics).
  // Recover that denominator per source via pages/avg_pp, sum, then divide.
  // Median can't be recovered without per-record data — leave it null.
  const totalRecsWithPages = proposal.reduce((a, s) =>
    a + (s.avg_pp ? Math.round(s.pages / s.avg_pp) : 0), 0);
  const totalAvg = totalRecsWithPages > 0
    ? Math.round(totalPages / totalRecsWithPages) : null;

  rows.push({
    labelHtml: '<strong>TOTAL</strong>',
    vols:      totalVols,
    works:     totalWorks,
    pages:     totalPages,
    avg:       totalAvg,
    median:    null,
    hasWorks:  true,
    isTotal:   true,
  });

  $('breakdown-body').innerHTML = rows.map((r) => `
    <tr class="${r.isTotal ? 'total-row' : ''}">
      <td>${r.labelHtml}</td>
      <td class="num">${fmtN(r.vols)}</td>
      <td class="num">${r.hasWorks ? fmtN(r.works) : '—'}</td>
      <td class="num">${fmtN(r.pages)}</td>
      <td class="num">${r.avg != null ? fmtN(r.avg) : '—'}</td>
      <td class="num">${r.median != null ? fmtN(r.median) : '—'}</td>
    </tr>
  `).join('');
}

function renderHistogram(bins) {
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  $('histogram').innerHTML = bins.map((b) => `
    <div class="hist-bin">
      <div class="hist-label">${b.label}</div>
      <div class="hist-bar-wrap"><div class="hist-bar" style="width: ${(b.count / maxCount * 100).toFixed(1)}%"></div></div>
      <div class="hist-count">${fmtN(b.count)}</div>
    </div>
  `).join('');
}

function renderTopWorks(topWorks) {
  $('top-works').innerHTML = topWorks.map((w) => `
    <li>
      <div class="topn-title${arClass(w.title)}" dir="auto">${escapeHtml(w.title)}</div>
      <div class="topn-author${w.author ? arClass(w.author) : ' empty'}" dir="auto">${escapeHtml(w.author || '—')}</div>
      <div class="topn-counts" dir="ltr">${fmtN(w.count)} volumes · ${fmtN(w.pages)} pages</div>
    </li>
  `).join('');
}

function renderTopVolumes(topVolumes) {
  $('top-volumes').innerHTML = topVolumes.map((r) => `
    <li>
      <div class="topn-title${arClass(r.title)}" dir="auto">${escapeHtml(r.title || '—')}</div>
      <div class="topn-author${r.author ? arClass(r.author) : ' empty'}" dir="auto">${escapeHtml(r.author || '—')}</div>
      <div class="topn-counts" dir="ltr">${fmtN(r.pages)} pages</div>
    </li>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
//   B · Corpus browser — search, filter, paginate
// ═══════════════════════════════════════════════════════════

const BROWSER = {
  data:     [],
  byId:     null,
  index:    null,
  filtered: [],
  page:     1,
  perPage:  25,
  expanded: new Set(),
  query:    '',
};

// At Tier 1 boot: populate the dropdowns from summary.json, show a
// friendly placeholder, and wire up the triggers that lazy-load the
// full corpus on first user interaction with the browser panel.
function initBrowserPlaceholder(summary) {
  BROWSER.totalRecordsExpected = summary.totals.records;

  // Populate discipline filter dropdown — counts come precomputed.
  const discSelect = $('b-discipline');
  for (const opt of summary.discipline_filter_options) {
    const o = document.createElement('option');
    o.value = opt.label;
    o.textContent = `${opt.label} (${fmtN(opt.count)})`;
    discSelect.appendChild(o);
  }

  // Source dropdown is hardcoded in HTML; annotate it with the counts and
  // override any stale labels in summary.json with the canonical names from
  // SOURCE_LABELS. <option> elements can't carry HTML, so the italic flag
  // for al-Maktaba al-Waqfiyya is dropped here (the breakdown table, badges,
  // and tile sub-text below render it with <em>).
  if (Array.isArray(summary.source_filter_options)) {
    for (const opt of summary.source_filter_options) {
      const optionEl = document.querySelector(`#b-source option[value="${opt.value}"]`);
      if (optionEl) optionEl.textContent = `${sourceLabelText(opt.value)} (${fmtN(opt.count)})`;
    }
  }

  $('b-summary').innerHTML =
    `<strong>${fmtN(summary.totals.records)}</strong> records ready · ` +
    `<span class="hint">search and filters activate on first interaction</span>`;
  $('browse-body').innerHTML =
    `<tr><td colspan="7" class="loading-cell">Focus the search box, scroll here, or tap a filter to load the full corpus.</td></tr>`;

  // Trigger Tier 2 load on first browser-panel interaction.
  const trigger = () => { ensureCorpusLoaded(); };
  const search = $('b-search');
  search.addEventListener('focus', trigger, { once: true });
  search.addEventListener('input', trigger, { once: true });

  // Scroll-into-view: pre-warm the corpus as the user reaches the panel.
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          obs.disconnect();
          trigger();
          break;
        }
      }
    }, { rootMargin: '200px' });
    obs.observe($('browser-panel'));
  }

  // Delegated click handler is safe to wire now — until corpus loads it
  // has nothing to act on, but registering early avoids a re-bind later.
  $('browse-body').addEventListener('click', handleBrowseClick);
}

let _corpusLoadPromise = null;

async function ensureCorpusLoaded() {
  if (_corpusLoadPromise) return _corpusLoadPromise;
  $('b-summary').innerHTML =
    `<span class="loading-pulse">Loading corpus and building search index…</span>`;
  $('browse-body').innerHTML =
    `<tr><td colspan="7" class="loading-cell">Loading ${fmtN(BROWSER.totalRecordsExpected || 0)} records…</td></tr>`;

  _corpusLoadPromise = (async () => {
    const response = await fetch('data/corpus_merged.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    initBrowser(data);
  })();

  try {
    await _corpusLoadPromise;
  } catch (err) {
    console.error('Failed to load corpus:', err);
    $('b-summary').textContent = `Could not load corpus_merged.json: ${err.message}`;
    _corpusLoadPromise = null;  // allow retry on next interaction
  }
  return _corpusLoadPromise;
}

function initBrowser(data) {
  BROWSER.data = data;
  BROWSER.byId = new Map(data.map((r) => [r.record_id, r]));

  // Build MiniSearch index from the freshly-loaded corpus.
  BROWSER.index = new MiniSearch({
    idField: 'record_id',
    fields: ['title', 'author', 'publisher', 'pub_place',
             'discipline_native', 'discipline_normalized'],
    storeFields: ['record_id'],
    searchOptions: {
      boost: { title: 3, author: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  BROWSER.index.addAll(data.map((r) => ({
    record_id:             r.record_id,
    title:                 r.title || '',
    author:                r.author || '',
    publisher:             r.publisher || '',
    pub_place:             r.pub_place || '',
    discipline_native:     r.discipline_native || '',
    discipline_normalized: r.discipline_normalized || '',
  })));

  // Enable controls.
  ['b-search', 'b-source', 'b-discipline', 'b-year-from', 'b-year-to',
   'b-prev', 'b-next'].forEach((id) => { $(id).disabled = false; });

  // Wire events. The Tier-1 placeholder added `once: true` focus/input
  // hooks for lazy-load; here we add the persistent search debounce that
  // drives subsequent typing.
  let searchTimer;
  $('b-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      BROWSER.query = $('b-search').value.trim();
      applyFilters();
    }, 200);
  });
  ['b-source', 'b-discipline'].forEach((id) =>
    $(id).addEventListener('change', applyFilters));
  ['b-year-from', 'b-year-to'].forEach((id) =>
    $(id).addEventListener('input', applyFilters));

  $('b-prev').addEventListener('click', () => {
    if (BROWSER.page > 1) { BROWSER.page--; renderBrowseTable(); }
  });
  $('b-next').addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(BROWSER.filtered.length / BROWSER.perPage));
    if (BROWSER.page < maxPage) { BROWSER.page++; renderBrowseTable(); }
  });

  // Pick up any value the user typed during the load (in case they typed
  // before the corpus arrived).
  BROWSER.query = $('b-search').value.trim();
  applyFilters();
}

function applyFilters() {
  const src      = $('b-source').value;
  const disc     = $('b-discipline').value;
  const yFromRaw = $('b-year-from').value.trim();
  const yToRaw   = $('b-year-to').value.trim();
  const yFrom    = yFromRaw === '' ? null : parseInt(yFromRaw, 10);
  const yTo      = yToRaw   === '' ? null : parseInt(yToRaw,   10);
  const q        = BROWSER.query;

  let candidates;
  if (q) {
    const hits = BROWSER.index.search(q, {
      boost: { title: 3, author: 2 },
      fuzzy: 0.2,
      prefix: true,
    });
    candidates = hits.map((h) => BROWSER.byId.get(h.id)).filter(Boolean);
  } else {
    candidates = BROWSER.data;
  }

  BROWSER.filtered = candidates.filter((r) => {
    if (src  && r.source !== src) return false;
    if (disc) {
      const d = r.discipline_normalized || '(unmapped)';
      if (d !== disc) return false;
    }
    if (yFrom != null) {
      if (typeof r.pub_year !== 'number' || r.pub_year < yFrom) return false;
    }
    if (yTo != null) {
      if (typeof r.pub_year !== 'number' || r.pub_year > yTo) return false;
    }
    return true;
  });

  BROWSER.page = 1;
  renderBrowseTable();
}

function renderBrowseTable() {
  const total   = BROWSER.filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / BROWSER.perPage));
  BROWSER.page  = Math.min(BROWSER.page, maxPage);

  const start = (BROWSER.page - 1) * BROWSER.perPage;
  const slice = BROWSER.filtered.slice(start, start + BROWSER.perPage);

  $('b-summary').innerHTML =
    `Showing <strong>${fmtN(total)}</strong> of <strong>${fmtN(BROWSER.data.length)}</strong> records`;
  $('b-pageinfo').textContent = `Page ${fmtN(BROWSER.page)} of ${fmtN(maxPage)}`;
  $('b-prev').disabled = BROWSER.page <= 1;
  $('b-next').disabled = BROWSER.page >= maxPage;

  $('browse-body').innerHTML = slice.map((r) => {
    const isExpanded = BROWSER.expanded.has(r.record_id);
    return rowHtml(r, isExpanded) + (isExpanded ? detailRowHtml(r) : '');
  }).join('') || `<tr><td colspan="7" class="loading-cell">No records match the current filters.</td></tr>`;
}

function rowHtml(r, expanded) {
  const discipline = r.discipline_normalized || r.discipline_native || '—';
  let titleHtml;
  if (r.permanent_link) {
    titleHtml = `<a href="${escapeHtml(r.permanent_link)}" target="_blank" rel="noopener" class="title-link" dir="auto">${escapeHtml(r.title || '—')}</a>`;
  } else {
    const path = localPath(r);
    titleHtml = `<button type="button" class="title-button" dir="auto"
      data-path="${escapeHtml(path)}" title="${escapeHtml(path) || 'no local path'}">${escapeHtml(r.title || '—')}</button>`;
  }
  return `<tr class="data-row${expanded ? ' expanded' : ''}" data-id="${escapeHtml(r.record_id)}">
    <td class="title-cell${arClass(r.title)}">${titleHtml}</td>
    <td class="author-cell${arClass(r.author)}" dir="auto">${escapeHtml(r.author || '—')}</td>
    <td class="num">${r.pub_year != null ? r.pub_year : '—'}</td>
    <td class="${arClass(r.pub_place).trim()}" dir="auto">${escapeHtml(r.pub_place || '—')}</td>
    <td class="num">${typeof r.pages === 'number' ? fmtN(r.pages) : '—'}</td>
    <td class="disc-cell${arClass(discipline)}" dir="auto">${escapeHtml(discipline)}</td>
    <td>${sourceBadgeHtml(r.source)}</td>
  </tr>`;
}

function detailRowHtml(r) {
  const rows = [];
  const add = (k, v) => { if (v != null && v !== '') rows.push([k, v]); };
  const span = (s)   => `<span dir="auto">${escapeHtml(s)}</span>`;
  const code = (s)   => `<code>${escapeHtml(s)}</code>`;

  add('Title',                    r.title  ? span(r.title)  : null);
  add('Author',                   r.author ? span(r.author) : null);
  add('Editor',                   r.editor ? span(r.editor) : null);
  add('Publisher',                r.publisher ? span(r.publisher) : null);
  add('Pub date (raw)',           r.pub_date_text);
  add('Discipline (native)',      r.discipline_native     ? span(r.discipline_native)     : null);
  add('Discipline (normalized)',  r.discipline_normalized ? span(r.discipline_normalized) : null);
  add('Language',                 r.language);
  add('Provider',                 r.provider ? span(r.provider) : null);
  add('LC call number',           r.lc_call_number ? code(r.lc_call_number) : null);
  if (r.vol_from != null || r.vol_to != null) {
    add('Volume range', `${r.vol_from ?? '—'} – ${r.vol_to ?? '—'}`);
  }
  add('Pages',  typeof r.pages === 'number' ? fmtN(r.pages) : null);
  add('Size',   typeof r.mb    === 'number' ? `${r.mb.toFixed(2)} MB` : null);
  if (r.permanent_link) {
    add('Permanent link',
        `<a href="${escapeHtml(r.permanent_link)}" target="_blank" rel="noopener">${escapeHtml(r.permanent_link)}</a>`);
  }
  add('Filename',     r.filename    ? code(r.filename)    : null);
  add('Parent path',  r.parent_path ? code(r.parent_path) : null);
  add('record_id',    code(r.record_id));
  if (r.work_id)      add('work_id', code(r.work_id));
  add('Extraction confidence', r.extraction_confidence);

  return `<tr class="detail-row"><td colspan="7"><div class="detail-panel"><dl>${
    rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join('')
  }</dl></div></td></tr>`;
}

function sourceBadgeHtml(src) {
  const clsMap = {
    aco:            'src-aco',
    shamela_ay:     'src-shamela',
    waqfeya:        'src-waqfeya',
    personal_other: 'src-other',
  };
  const cls = clsMap[src] || 'src-other';
  return `<span class="src-badge ${cls}">${sourceLabelHtml(src)}</span>`;
}

function localPath(r) {
  if (r.parent_path && r.filename) return `${r.parent_path}/${r.filename}`;
  return r.filename || r.parent_path || '';
}

function handleBrowseClick(e) {
  // Title button click → copy path + show inline tip
  const titleBtn = e.target.closest('.title-button');
  if (titleBtn) {
    e.stopPropagation();
    const path = titleBtn.dataset.path;
    if (!path) return;
    const showTip = () => {
      titleBtn.querySelectorAll('.copied-tip').forEach((n) => n.remove());
      const tip = document.createElement('span');
      tip.className = 'copied-tip';
      tip.textContent = 'path copied';
      titleBtn.appendChild(tip);
      setTimeout(() => tip.remove(), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(path).then(showTip, showTip);
    } else {
      showTip();
    }
    return;
  }
  // Anchor (permanent_link) — let browser handle it
  if (e.target.closest('a')) return;
  // Otherwise, toggle row expansion
  const row = e.target.closest('tr.data-row');
  if (!row) return;
  const id = row.dataset.id;
  if (BROWSER.expanded.has(id)) BROWSER.expanded.delete(id);
  else                          BROWSER.expanded.add(id);
  renderBrowseTable();
}

// ═══════════════════════════════════════════════════════════
//   Layer 2 — Discipline distribution charts
// ═══════════════════════════════════════════════════════════

const SHAMELA_BAR = '#6a9a76';
const ACO_BAR     = '#5d7da6';
const WAQFEYA_BAR = '#b8865c';

const UNIFIED_ORDER = [
  'علوم القرآن',
  'علوم الحديث',
  'العقيدة والكلام',
  'الفقه وأصوله',
  'الرقاق والدعوة',
  'التراجم والسيرة',
  'التاريخ والجغرافيا',
  'اللغة والمعاجم',
  'الأدب والبلاغة',
  'المراجع والمجاميع',
  'مجاميع المؤلفين',
  'الفلسفة والدين (مختلط)',
  'اللغات والآداب (مختلط)',
  'العلوم الحديثة',
];

// Asterisk-wrapped runs (e.g. "*ʿaqīda*") mark words that would render in
// italic typography in prose. Chart.js renders Y-axis labels via canvas,
// which can't show inline italics in a single label, so we strip the markers
// at chart-render time. The dictionary preserves them for any future HTML
// rendering (legend, prose, tooltips).
const BUCKET_TRANSLATIONS = {
  'علوم القرآن':              'Qurʾānic Sciences',
  'علوم الحديث':              'Ḥadīṯ Sciences',
  'العقيدة والكلام':          'Creed & Theology (*ʿaqīda* and *kalām*)',
  'الفقه وأصوله':             'Law & Legal Theory (*fiqh* and *uṣūl*)',
  'الرقاق والدعوة':           'Piety & Preaching (*raqāʾiq* and *daʿwa*)',
  'التراجم والسيرة':          'Biography, Prosopography & Hagiography',
  'التاريخ والجغرافيا':       'History & Geography',
  'اللغة والمعاجم':           'Language & Lexicography',
  'الأدب والبلاغة':           'Literature & Rhetoric (*adab* and *balāġa*)',
  'المراجع والمجاميع':        'Reference & Compilations',
  'مجاميع المؤلفين':          'Author Corpora',
  'الفلسفة والدين (مختلط)':   'Religion & Philosophy (LC-merged)',
  'اللغات والآداب (مختلط)':   'Languages & Literatures (LC-merged)',
  'العلوم الحديثة':           'Modern Subjects',
};

// ACO Library-of-Congress top-level Arabic labels → English (20 entries).
const ACO_LC_TRANSLATIONS = {
  'الفلسفة وعلم النفس والدين':                       'Philosophy, Psychology, Religion',
  'اللغات والآداب':                                   'Language and Literature',
  'تاريخ العالم وتاريخ أوروبا وآسيا وأفريقيا':         'World History (Europe, Asia, Africa, etc.)',
  'القانون':                                          'Law',
  'العلوم الاجتماعية':                                'Social Sciences',
  'التعليم':                                          'Education',
  'الببليوغرافيا ، وعلوم المكتبات ، والمعلومات العامة': 'Bibliography & Library Science',
  'العلوم السياسية':                                  'Political Science',
  'العلوم':                                           'Science',
  'المعارف العامة':                                   'General Works',
  'الجغرافيا والأنثربولوجيا والترفيه':                 'Geography, Anthropology, Recreation',
  'العلوم الفرعية للتاريخ':                            'Auxiliary Sciences of History',
  'الطب':                                             'Medicine',
  'الفنون الجميلة':                                   'Fine Arts',
  'الزراعة':                                          'Agriculture',
  'التكنولوجيا':                                      'Technology',
  'الموسيقى':                                         'Music',
  'تاريخ أمريكا':                                     'History of the Americas',
  'العلوم البحرية':                                   'Naval Science',
  'العلوم العسكرية':                                  'Military Science',
};

// Shamela emic discipline labels → English (41 entries).
const SHAMELA_NATIVE_TRANSLATIONS = {
  'التفاسير':                          'Qurʾān Commentaries (*tafāsīr*)',
  'علوم القرآن':                       'Qurʾānic Sciences',
  'التجويد والقراءات':                 'Recitation & Variant Readings (*tajwīd* & *qirāʾāt*)',
  'متون الحديث':                       'Ḥadīṯ Collections',
  'شروح الحديث':                       'Ḥadīṯ Commentaries',
  'علوم الحديث':                       'Ḥadīṯ Sciences',
  'كتب التخريج والزوائد':              'Source-Tracing & Supplemental Ḥadīṯ',
  'الأجزاء الحديثية':                  'Ḥadīṯ Booklets (*aǧzāʾ*)',
  'العلل والسؤالات':                   'Defects & Inquiries (*ʿilal* & *suʾālāt*)',
  'العقيدة':                           'Creed (*ʿaqīda*)',
  'الفرق والردود':                     'Sects & Refutations',
  'فقه عام':                           'General Jurisprudence',
  'فقه شافعي':                         'Shāfiʿī Jurisprudence',
  'فقه حنبلي':                         'Ḥanbalī Jurisprudence',
  'فقه مالكي':                         'Mālikī Jurisprudence',
  'فقه حنفي':                          'Ḥanafī Jurisprudence',
  'الفتاوى':                           'Legal Opinions (*fatāwā*)',
  'أصول الفقه والقواعد الفقهية':       'Legal Theory & Maxims',
  'السياسة الشرعية والقضاء':           'Islamic Governance & Judiciary',
  'الرقاق والآداب والأذكار':           'Piety, Etiquette & Litanies',
  'الدعوة وأحوال المسلمين':            'Preaching & Muslim Affairs',
  'التراجم والطبقات':                  'Biographical Dictionaries & Generations',
  'السيرة والشمائل':                   'Prophetic Biography & Virtues',
  'الأنساب':                          'Genealogy (*ansāb*)',
  'التاريخ':                          'History',
  'البلدان والجغرافيا والرحلات':       'Geography & Travel',
  'النحو والصرف':                     'Grammar & Morphology',
  'الغريب والمعاجم ولغة الفقه':        'Lexicography & Technical Vocabulary',
  'كتب اللغة':                        'Linguistics',
  'الأدب والبلاغة':                    'Literature & Rhetoric',
  'الدواوين الشعرية':                 'Poetry Collections (*dīwāns*)',
  'فهارس الكتب والأدلة':              'Bibliographic Indexes',
  'الجوامع والمجلات ونحوها':          'Collections & Periodicals',
  'بحوث ومسائل':                     'Studies & Treatises',
  'علوم أخرى':                       'Other Disciplines',
  'كتب إسلامية عامة':                 'General Islamic Works',
  'محاضرات مفرغة':                   'Transcribed Lectures',
  'كتب ابن تيمية':                   'Works of Ibn Taymiyya',
  'كتب الألباني':                    'Works of al-Albānī',
  'كتب ابن القيم':                   'Works of Ibn al-Qayyim',
  'كتب ابن أبي الدنيا':               'Works of Ibn Abī al-Dunyā',
};

// Waqfeya emic categories — Dewey-prefixed Arabic labels → English (top ~25).
// Categories below the chart's top-N cut-off don't need translations; they
// fall through to the Arabic-only fallback in bilingualLabelEntry().
const WAQFEYA_NATIVE_TRANSLATIONS = {
  '217 كتب الفقه العام':                         'General Jurisprudence (*fiqh*)',
  '920 كتب التراجم والأعلام':                   'Biographical Dictionaries (*tarāǧim*)',
  '213.7 باقي مجموعات الحديث':                  'Other Ḥadīṯ Collections',
  '214 كتب التوحيد والعقيدة':                   'Theology & Creed (*tawḥīd* & *ʿaqīda*)',
  '216.1 كتب أصول الفقه وقواعده':               'Legal Theory & Maxims (*uṣūl al-fiqh*)',
  '218.1 كتب التزكية والأخلاق والآداب':         'Piety, Ethics & Etiquette (*tazkiya*)',
  '213.1 كتب مصطلح الحديث':                     'Ḥadīṯ Terminology (*muṣṭalaḥ*)',
  '810 كتب الأدب':                              'Adab Literature',
  '215 الفرق والأديان والردود':                 'Sects, Religions & Refutations',
  '956 كتب التاريخ الإسلامي':                    'Islamic History',
  '218.5 كتب الدعوة والدفاع عن الإسلام':         'Daʿwa & Apologetics',
  '211 كتب علوم القرآن':                         'Qurʾānic Sciences',
  '213.3 كتب الجرح والتعديل':                   'Ḥadīṯ Critic Biography (*ǧarḥ wa-taʿdīl*)',
  '213.4 كتب الكتب الستة':                       'The Six Canonical Ḥadīṯ Books',
  '218.4 كتب الثقافة الإسلامية العامة':          'General Islamic Culture',
  '212 كتب التفاسير':                            'Qurʾān Commentaries (*tafāsīr*)',
  '216.9 كتب السياسة الشرعية والأحكام السلطانية': 'Islamic Governance & Sultanic Law',
  '213.6 كتب المسانيد الأخرى والجوامع':          'Other Musnads & Collections',
  '219 كتب السيرة النبوية':                      'Prophetic Biography (*sīra*)',
  '217.4 كتب الفقه الحنبلي':                    'Ḥanbalī Jurisprudence',
  '415 كتب النحو والصرف':                       'Grammar & Morphology (*naḥw* & *ṣarf*)',
  '910 كتب الجغرافيا والرحلات':                  'Geography & Travel',
  '215 الشيعة والرافضة والباطنية والبهائية والقاديانية': 'Shīʿa & Heterodox Sects',
  '218.2 مكتبة شهر رمضان':                       'Ramadan Library',
  '218.2 كتب الأذكار والشعائر':                  'Devotional Litanies & Rites',
  '811 دواوين الشعر':                            'Poetry Collections (*dīwāns*)',
  '215 اليهود والنصارى والمستشرقون..':          'Jews, Christians & Orientalists',
  '211.9 كتب مباحث قرآنية عامة':                 'General Qurʾānic Studies',
  '211.8 كتب التجويد والقراءات':                 'Recitation & Variant Readings',
  '410 كتب اللغة':                              'Linguistics',
  '217.9 كتب الفتاوى':                          'Legal Opinions (*fatāwā*)',
  '217.2 كتب الفقه المالكي':                    'Mālikī Jurisprudence',
  '217.3 كتب الفقه الشافعي':                    'Shāfiʿī Jurisprudence',
  '413 المعاجم اللغوية العربية':                 'Arabic Lexicography',
};

// Convert markdown-style *italic* runs into HTML <em>, escaping the rest.
function processItalics(text) {
  return String(text || '').split(/\*([^*]+)\*/g)
    .map((p, i) => (i % 2 === 0) ? escapeHtml(p) : `<em>${escapeHtml(p)}</em>`)
    .join('');
}

// Catalog sources sometimes store alef-hamza decomposed (U+0627 U+0654)
// while our dictionaries use the composed form (U+0623). NFC-normalize both
// sides for lookup; otherwise visually-identical strings fail to match.
const _dictNFCCache = new WeakMap();
function nfcDict(dict) {
  let m = _dictNFCCache.get(dict);
  if (!m) {
    m = new Map();
    for (const [k, v] of Object.entries(dict)) m.set(k.normalize('NFC'), v);
    _dictNFCCache.set(dict, m);
  }
  return m;
}

// Build a bilingual label entry for an Arabic-source category.
// `lang` selects which language is primary (the larger, weighted line).
// If no translation exists, the source is shown as the only line (no secondary).
function bilingualLabelEntry(arabicSource, dict, lang) {
  const key = String(arabicSource || '').normalize('NFC');
  const enRaw = nfcDict(dict).get(key);
  if (!enRaw) {
    return {
      primary:       arabicSource,
      primaryLang:   'ar',
      primaryHtml:   escapeHtml(arabicSource),
      secondary:     null,
      secondaryLang: null,
      secondaryHtml: '',
    };
  }
  const enPlain = enRaw.replace(/\*/g, '');
  if (lang === 'en') {
    return {
      primary:       enPlain,
      primaryLang:   'en',
      primaryHtml:   processItalics(enRaw),
      secondary:     arabicSource,
      secondaryLang: 'ar',
      secondaryHtml: escapeHtml(arabicSource),
    };
  }
  return {
    primary:       arabicSource,
    primaryLang:   'ar',
    primaryHtml:   escapeHtml(arabicSource),
    secondary:     enPlain,
    secondaryLang: 'en',
    secondaryHtml: processItalics(enRaw),
  };
}

// "Other (N more)" — English only, no secondary line.
function otherLabelEntry(label) {
  return {
    primary:       label,
    primaryLang:   'en',
    primaryHtml:   escapeHtml(label),
    secondary:     null,
    secondaryLang: null,
    secondaryHtml: '',
  };
}

// Bare numerics ("192", "462", etc.) leak into ACO discipline_native as
// singletons. They're cataloging noise — strip them out of the charts.
function looksLikeJunkCategory(label) {
  if (label == null) return true;
  const t = String(label).trim();
  if (t.length === 0) return true;
  if (/^[0-9\s_\-.]+$/.test(t)) return true;
  return false;
}

// Reshape the precomputed `disciplines` block from summary.json into the
// Map<label, {pdfs, works}> structures the chart machinery expects.
function disciplinesFromSummary(disciplines) {
  const toMap = (arr) => {
    const m = new Map();
    for (const it of arr) m.set(it.label, { pdfs: it.pdfs, works: it.works });
    return m;
  };
  return {
    shamelaNative:  toMap(disciplines.shamela_native),
    acoNative:      toMap(disciplines.aco_native),
    waqfeyaNative:  toMap(disciplines.waqfeya_native),
    shamelaUnified: toMap(disciplines.shamela_unified),
    acoUnified:     toMap(disciplines.aco_unified),
    waqfeyaUnified: toMap(disciplines.waqfeya_unified),
    totals:         disciplines.totals,
  };
}

// Plugin: render Y-axis labels as HTML overlays so we can stack two languages
// per row (primary + secondary), use Amiri for Arabic, and render *italic*
// runs in English transliterated terms. Canvas can't do mixed-font runs in a
// single label; HTML can.
const bilingualLabelsPlugin = {
  id: 'bilingualLabels',
  afterDatasetsDraw(chart) {
    const host = chart.canvas.parentElement;
    if (!host) return;

    let overlay = host.querySelector('.axis-labels-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'axis-labels-overlay';
      host.appendChild(overlay);
    }

    const entries = chart.$labelEntries;
    if (!entries || entries.length === 0) {
      overlay.replaceChildren();
      return;
    }

    const yAxis = chart.scales.y;
    const chartAreaLeft = chart.chartArea.left;

    overlay.style.width = chartAreaLeft + 'px';
    overlay.replaceChildren();

    entries.forEach((entry, i) => {
      const y = yAxis.getPixelForTick(i);
      if (y == null || isNaN(y)) return;

      const div = document.createElement('div');
      div.className = 'axis-label';
      div.style.top = y + 'px';
      div.style.right = '8px';
      div.style.maxWidth = Math.max(60, chartAreaLeft - 16) + 'px';

      const primaryEl = document.createElement('div');
      primaryEl.className = 'al-primary ' + (entry.primaryLang || 'en');
      primaryEl.innerHTML = entry.primaryHtml;
      div.appendChild(primaryEl);

      if (entry.secondaryHtml) {
        const secondaryEl = document.createElement('div');
        secondaryEl.className = 'al-secondary ' + (entry.secondaryLang || 'en');
        secondaryEl.innerHTML = entry.secondaryHtml;
        div.appendChild(secondaryEl);
      }

      overlay.appendChild(div);
    });
  },
};

// Plugin: render "1,234 (10.6%)" at the end of each bar.
const endLabelPlugin = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f1f1f';
    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar, i) => {
        const value = dataset.data[i];
        if (value == null || value === 0) return;
        const pct = dataset.pcts?.[i];
        const text = pct != null
          ? `${value.toLocaleString()} (${pct.toFixed(1)}%)`
          : value.toLocaleString();
        ctx.fillText(text, bar.x + 6, bar.y);
      });
    });
    ctx.restore();
  },
};

function topNWithOther(entries, metric, total, n) {
  const sorted = entries.slice().sort((a, b) => b[1][metric] - a[1][metric]);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const restSum = rest.reduce((s, [, v]) => s + v[metric], 0);

  const items = top.map(([k, v]) => ({ label: k, value: v[metric], isOther: false }));
  if (rest.length > 0) {
    items.push({ label: `Other (${rest.length} more)`, value: restSum, isOther: true });
  }
  return {
    items,
    labels: items.map((it) => it.label),
    values: items.map((it) => it.value),
    pcts:   items.map((it) => total > 0 ? (it.value / total) * 100 : 0),
  };
}

function buildShamelaPayload(metric, agg) {
  const entries = [...agg.shamelaNative.entries()];
  const total = agg.totals.shamela[metric];
  return topNWithOther(entries, metric, total, 20);
}

function buildAcoPayload(metric, agg) {
  const entries = [...agg.acoNative.entries()].filter(([k]) => !looksLikeJunkCategory(k));
  const total = agg.totals.aco[metric];
  return topNWithOther(entries, metric, total, 15);
}

function buildWaqfeyaPayload(metric, agg) {
  const entries = [...agg.waqfeyaNative.entries()];
  const total = agg.totals.waqfeya[metric];
  return topNWithOther(entries, metric, total, 20);
}

function buildUnifiedPayload(metric, agg) {
  const acoTot = agg.totals.aco[metric];
  const shTot  = agg.totals.shamela[metric];
  const wqTot  = agg.totals.waqfeya[metric];
  const acoData = [], shData = [], wqData = [];
  const acoPcts = [], shPcts = [], wqPcts = [];
  for (const k of UNIFIED_ORDER) {
    const a = agg.acoUnified.get(k);
    const s = agg.shamelaUnified.get(k);
    const w = agg.waqfeyaUnified.get(k);
    const av = a ? a[metric] : 0;
    const sv = s ? s[metric] : 0;
    const wv = w ? w[metric] : 0;
    acoData.push(av);
    shData.push(sv);
    wqData.push(wv);
    acoPcts.push(acoTot > 0 ? (av / acoTot) * 100 : 0);
    shPcts.push (shTot  > 0 ? (sv / shTot ) * 100 : 0);
    wqPcts.push (wqTot  > 0 ? (wv / wqTot ) * 100 : 0);
  }
  return { labels: UNIFIED_ORDER, acoData, shData, wqData, acoPcts, shPcts, wqPcts };
}

// Padding-left allocates room for the HTML-overlay axis labels.
const AXIS_LABEL_AREA = 280;

function bilingualTitleCallback(items) {
  const chart = items[0].chart;
  const entry = chart.$labelEntries?.[items[0].dataIndex];
  if (!entry) return items[0].label;
  return [entry.primary, entry.secondary].filter(Boolean);
}

function makeSingleBarChart(canvasId, color) {
  return new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], pcts: [], backgroundColor: color, borderRadius: 2, borderSkipped: false }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      layout: { padding: { right: 110, left: AXIS_LABEL_AREA, top: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: bilingualTitleCallback,
            label: (ctx) => {
              const v = ctx.parsed.x;
              const pct = ctx.dataset.pcts?.[ctx.dataIndex];
              return pct != null
                ? `${v.toLocaleString()}  (${pct.toFixed(1)}% of source)`
                : v.toLocaleString();
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid:   { color: 'rgba(0,0,0,0.06)' },
          border: { display: false },
          ticks:  { font: { size: 11 }, color: '#6b6b6b' },
        },
        y: {
          grid:   { display: false },
          border: { display: false },
          ticks:  { callback: () => '', autoSkip: false },
        },
      },
    },
    plugins: [bilingualLabelsPlugin, endLabelPlugin],
  });
}

function makeUnifiedChart(canvasId) {
  return new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: UNIFIED_ORDER,
      datasets: [
        { label: sourceLabelText('aco'),        data: [], pcts: [], backgroundColor: ACO_BAR,     borderRadius: 2, borderSkipped: false },
        { label: sourceLabelText('shamela_ay'), data: [], pcts: [], backgroundColor: SHAMELA_BAR, borderRadius: 2, borderSkipped: false },
        { label: sourceLabelText('waqfeya'),    data: [], pcts: [], backgroundColor: WAQFEYA_BAR, borderRadius: 2, borderSkipped: false },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      layout: { padding: { right: 110, left: AXIS_LABEL_AREA, top: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: bilingualTitleCallback,
            label: (ctx) => {
              const v = ctx.parsed.x;
              const pct = ctx.dataset.pcts?.[ctx.dataIndex];
              return `${ctx.dataset.label}: ${v.toLocaleString()}  (${pct != null ? pct.toFixed(1) : '0.0'}% of source)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid:   { color: 'rgba(0,0,0,0.06)' },
          border: { display: false },
          ticks:  { font: { size: 11 }, color: '#6b6b6b' },
        },
        y: {
          grid:   { display: false },
          border: { display: false },
          ticks:  { callback: () => '', autoSkip: false },
        },
      },
    },
    plugins: [bilingualLabelsPlugin, endLabelPlugin],
  });
}

const DISC = { agg: null, charts: null, metric: 'pdfs', lang: 'ar' };

function initDisciplineCharts(summary) {
  if (typeof Chart === 'undefined') {
    document.getElementById('discipline-panel').insertAdjacentHTML('beforeend',
      '<p class="loading-cell">Chart.js failed to load — discipline charts unavailable.</p>');
    return;
  }

  DISC.agg = disciplinesFromSummary(summary.disciplines);
  DISC.charts = {
    shamela: makeSingleBarChart('chart-shamela', SHAMELA_BAR),
    aco:     makeSingleBarChart('chart-aco',     ACO_BAR),
    waqfeya: makeSingleBarChart('chart-waqfeya', WAQFEYA_BAR),
    unified: makeUnifiedChart  ('chart-unified'),
  };

  document.querySelectorAll('.metric-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.metric;
      if (next === DISC.metric) return;
      DISC.metric = next;
      document.querySelectorAll('.metric-btn').forEach((b) => {
        const on = b.dataset.metric === next;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      updateDisciplineCharts();
    });
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.lang;
      if (next === DISC.lang) return;
      DISC.lang = next;
      document.querySelectorAll('.lang-btn').forEach((b) => {
        const on = b.dataset.lang === next;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      updateDisciplineCharts();
    });
  });

  updateDisciplineCharts();
}

function entriesFromPayload(payload, dict, lang) {
  return payload.items.map((it) =>
    it.isOther ? otherLabelEntry(it.label) : bilingualLabelEntry(it.label, dict, lang)
  );
}

function updateDisciplineCharts() {
  const m = DISC.metric;
  const lang = DISC.lang;

  const s = buildShamelaPayload(m, DISC.agg);
  DISC.charts.shamela.$labelEntries = entriesFromPayload(s, SHAMELA_NATIVE_TRANSLATIONS, lang);
  DISC.charts.shamela.data.labels = DISC.charts.shamela.$labelEntries.map((e) => e.primary);
  DISC.charts.shamela.data.datasets[0].data = s.values;
  DISC.charts.shamela.data.datasets[0].pcts = s.pcts;
  DISC.charts.shamela.update();

  const a = buildAcoPayload(m, DISC.agg);
  DISC.charts.aco.$labelEntries = entriesFromPayload(a, ACO_LC_TRANSLATIONS, lang);
  DISC.charts.aco.data.labels = DISC.charts.aco.$labelEntries.map((e) => e.primary);
  DISC.charts.aco.data.datasets[0].data = a.values;
  DISC.charts.aco.data.datasets[0].pcts = a.pcts;
  DISC.charts.aco.update();

  const w = buildWaqfeyaPayload(m, DISC.agg);
  DISC.charts.waqfeya.$labelEntries = entriesFromPayload(w, WAQFEYA_NATIVE_TRANSLATIONS, lang);
  DISC.charts.waqfeya.data.labels = DISC.charts.waqfeya.$labelEntries.map((e) => e.primary);
  DISC.charts.waqfeya.data.datasets[0].data = w.values;
  DISC.charts.waqfeya.data.datasets[0].pcts = w.pcts;
  DISC.charts.waqfeya.update();

  const u = buildUnifiedPayload(m, DISC.agg);
  DISC.charts.unified.$labelEntries =
    UNIFIED_ORDER.map((k) => bilingualLabelEntry(k, BUCKET_TRANSLATIONS, lang));
  DISC.charts.unified.data.labels = DISC.charts.unified.$labelEntries.map((e) => e.primary);
  DISC.charts.unified.data.datasets[0].data = u.acoData;
  DISC.charts.unified.data.datasets[0].pcts = u.acoPcts;
  DISC.charts.unified.data.datasets[1].data = u.shData;
  DISC.charts.unified.data.datasets[1].pcts = u.shPcts;
  DISC.charts.unified.data.datasets[2].data = u.wqData;
  DISC.charts.unified.data.datasets[2].pcts = u.wqPcts;
  DISC.charts.unified.update();
}
