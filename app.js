// Phase 1 corpus baseline. The corpus-size slider drives all live calculations;
// this constant exists for the read-only "Current corpus (Phase 1)" tile and
// the records-per-page average derived from it.
// (Future enhancement: fetch() data/corpus_merged.json to verify these.)
const CORPUS = {
  pages:   10_801_340,
  records: 29_908,
  pagesPerRecord: 360,        // ≈ 10.8M / 30k; used to scale records with corpus size
};

const PROJECT_YEARS         = 21;
const DEV_YEARS_INTENSIVE   = 3;
const DEV_YEARS_MAINTENANCE = PROJECT_YEARS - DEV_YEARS_INTENSIVE;
const HOURS_PER_FTE_DAY     = 8;
const WORKDAYS_PER_YEAR     = 220;
const FULL_TIME_HOURS_WEEK  = 40;
const SECONDS_PER_DAY       = 86_400;

// Pages per FTE-day (8 h) when an experienced reviewer is doing 3-way-diff
// click-correction. The threshold-year sanity-check in the spec uses this rate.
const CORRECTION_PAGES_PER_FTE_DAY = 120;

// Strategy multipliers applied to the DGX nominal throughput.
//   self-consensus: 3 stochastic passes batched on one model → ≈1.0× nominal
//   multi-model:    3 VLMs contending for memory               → ≈0.5× nominal
//   fine-tuned:     single smaller, calibrated model           → ≈1.33× nominal
// At the default 6 pages/sec this yields 6 / 3 / 8 pages/sec respectively.
const STRATEGY_MULT = {
  self:      1.0,
  multi:     0.5,
  finetuned: 1.333,
};

const fmt = {
  int:  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  one:  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
  two:  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
  four: new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 5 }),
};

const $    = (id) => document.getElementById(id);
const euro = (v)  => '€ ' + fmt.int.format(Math.round(v));

function selectedStrategy() {
  const el = document.querySelector('input[name="ocr-strategy"]:checked');
  return el ? el.value : 'self';
}

function compute() {
  // ── Inputs ──────────────────────────────────────────────
  const corpusM     = parseFloat($('corpus-size').value) || 0;
  const corpusPages = corpusM * 1_000_000;
  const corpusRecs  = corpusPages / CORPUS.pagesPerRecord;

  const dgxNom      = parseFloat($('dgx-throughput').value) || 1;
  const strategy    = selectedStrategy();
  const strategyMul = STRATEGY_MULT[strategy];
  const effThru     = dgxNom * strategyMul;

  const consensus   = parseFloat($('llm-consensus').value) || 0;
  const tagging     = parseFloat($('llm-tagging').value)   || 0;
  const biblio      = parseFloat($('llm-biblio').value)    || 0;

  const ftRuns      = parseInt($('ft-runs').value, 10) || 0;
  const ftCost      = parseFloat($('ft-cost').value)   || 0;

  const plHrs       = parseFloat($('pl-hours').value)       || 0;
  const postdocMain = parseFloat($('postdoc-maint').value)  || 0;
  const postdocHrs  = parseFloat($('postdoc-hours').value)  || 0;
  const phdStart    = parseInt($('phd-start').value, 10)    || 1;
  const phdHrs      = parseFloat($('phd-hours').value)      || 0;
  const nStudents   = parseInt($('num-students').value, 10) || 0;
  const studentHW   = parseFloat($('student-hours').value)  || 0;
  const ftThreshold = parseInt($('ft-threshold').value, 10) || 0;
  // const reduction = $('model-reduction').checked;  // exposed but doesn't feed any output number

  // ── Mirror slider values back into labels ───────────────
  $('corpus-size-val').textContent     = fmt.int.format(corpusM);
  $('corpus-records-val').textContent  = fmt.int.format(Math.round(corpusRecs));
  $('dgx-throughput-val').textContent  = fmt.int.format(dgxNom);
  $('ft-runs-val').textContent         = fmt.int.format(ftRuns);
  $('ft-cost-val').textContent         = fmt.int.format(ftCost);
  $('pl-hours-val').textContent        = fmt.one.format(plHrs);
  $('postdoc-maint-val').textContent   = fmt.int.format(postdocMain);
  $('postdoc-hours-val').textContent   = fmt.one.format(postdocHrs);
  $('phd-start-val').textContent       = fmt.int.format(phdStart);
  $('phd-hours-val').textContent       = fmt.one.format(phdHrs);
  $('num-students-val').textContent    = fmt.int.format(nStudents);
  $('student-hours-val').textContent   = fmt.int.format(studentHW);
  $('ft-threshold-val').textContent    = fmt.int.format(ftThreshold);

  // ── Preset chip highlight ───────────────────────────────
  document.querySelectorAll('.preset[data-target="corpus-size"]').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === corpusM);
  });

  // ── 1 · Monetary costs (€) ──────────────────────────────
  const hardwareEUR = 5_000;
  const llmEUR      = corpusPages * (consensus + tagging) + corpusRecs * biblio;
  const ftEUR       = ftRuns * ftCost;
  const operational = llmEUR + ftEUR;
  const envelope    = hardwareEUR + operational;

  $('cost-llm').textContent         = euro(llmEUR);
  $('cost-ft').textContent          = euro(ftEUR);
  $('cost-operational').textContent = euro(operational);
  $('total-envelope').textContent   = euro(envelope);
  $('envelope-sub').textContent =
    `Across ${fmt.int.format(corpusPages)} pages (~${fmt.int.format(Math.round(corpusRecs))} records) over 21-year project`;

  // ── 2 · Human time (FTE) ────────────────────────────────
  const plPY      = PROJECT_YEARS * (plHrs / HOURS_PER_FTE_DAY);
  const postdocPY = DEV_YEARS_INTENSIVE   * 1.0 * 2
                  + DEV_YEARS_MAINTENANCE * (postdocMain / 100) * 2;
  const phdPY     = 4;
  const studentSHK = nStudents * (studentHW / FULL_TIME_HOURS_WEEK) * PROJECT_YEARS;

  const seniorPY = plPY + postdocPY + phdPY;

  $('pl-py').textContent      = fmt.one.format(plPY)      + ' PY';
  $('postdoc-py').textContent = fmt.one.format(postdocPY) + ' PY';
  $('student-shk').textContent = fmt.one.format(studentSHK) + ' SHK-yrs';
  $('senior-py').textContent   = fmt.one.format(seniorPY);
  $('total-shk').textContent   = fmt.one.format(studentSHK);

  // ── Team correction throughput & threshold year ─────────
  // Pages-per-day total OCR-correction throughput.
  // Sums daily correction hours across roles, converts to FTE-day equivalents
  // (÷ HOURS_PER_FTE_DAY), then multiplies by the per-FTE-day correction rate.
  // (Matches the proposal sanity-check arithmetic: 9 h/day → 1.125 FTE-days → 135 pages/day.)
  const studentHrsDay = nStudents * studentHW / 5;  // 5-day workweek
  const totalCorrHrsDay = plHrs + 2 * postdocHrs + phdHrs + studentHrsDay;
  const pagesPerDay  = (totalCorrHrsDay / HOURS_PER_FTE_DAY) * CORRECTION_PAGES_PER_FTE_DAY;
  const pagesPerYear = pagesPerDay * WORKDAYS_PER_YEAR;

  $('team-throughput').textContent = pagesPerYear > 0
    ? `${fmt.int.format(Math.round(pagesPerDay))} pages/day · ${fmt.int.format(Math.round(pagesPerYear))} pages/year`
    : '— · —';

  let thresholdYrLabel, thresholdOutLabel;
  if (pagesPerYear <= 0) {
    thresholdYrLabel = thresholdOutLabel = 'not reached (no correction work)';
  } else {
    const yrsExact = ftThreshold / pagesPerYear;
    if (yrsExact > PROJECT_YEARS) {
      thresholdYrLabel = thresholdOutLabel = `not reached within 21 years (${fmt.one.format(yrsExact)} yrs)`;
    } else {
      const yrInt = Math.max(1, Math.ceil(yrsExact));
      thresholdYrLabel  = `Year ${yrInt}`;
      thresholdOutLabel = `Year ${yrInt} · ~${fmt.one.format(yrsExact)} yrs from start`;
    }
  }
  $('threshold-year-readout').textContent = thresholdYrLabel;
  $('threshold-out').textContent          = thresholdOutLabel;

  // ── 3 · Schedule ────────────────────────────────────────
  const wallSecs   = effThru > 0 ? corpusPages / effThru : Infinity;
  const wallHrs    = wallSecs / 3600;
  const wallDays   = wallSecs / SECONDS_PER_DAY;

  const nominalSecs = dgxNom > 0 ? corpusPages / dgxNom : Infinity;
  const nominalDays = nominalSecs / SECONDS_PER_DAY;

  $('b-wallclock').textContent =
    `${fmt.one.format(nominalDays)} days continuous`;
  $('c-effective').textContent =
    `${fmt.one.format(effThru)} pages/sec`;
  $('ocr-wall').textContent =
    `${fmt.one.format(wallDays)} days`;
  $('ocr-wall-sub').textContent =
    `${fmt.int.format(Math.round(wallHrs))} hours continuous, ${fmt.one.format(effThru)} pages/sec effective (${strategyLabel(strategy)})`;
}

function strategyLabel(s) {
  return ({
    self:      'self-consensus',
    multi:     'multi-model consensus',
    finetuned: 'fine-tuned local',
  })[s] || s;
}

// ── Wire up slider ↔ number-input pairs ───────────────────
function pair(sliderId, numberId) {
  const slider = $(sliderId);
  const number = $(numberId);
  slider.addEventListener('input', () => { number.value = slider.value; compute(); });
  number.addEventListener('input', () => { slider.value = number.value; compute(); });
}

[
  ['llm-consensus', 'llm-consensus-num'],
  ['llm-tagging',   'llm-tagging-num'],
  ['llm-biblio',    'llm-biblio-num'],
].forEach(([s, n]) => pair(s, n));

// Single-slider inputs (no paired number box)
[
  'corpus-size', 'dgx-throughput',
  'ft-runs', 'ft-cost',
  'pl-hours', 'postdoc-maint', 'postdoc-hours',
  'phd-start', 'phd-hours',
  'num-students', 'student-hours',
  'ft-threshold',
].forEach((id) => {
  $(id).addEventListener('input', compute);
});

// Strategy radio + reduction checkbox
document.querySelectorAll('input[name="ocr-strategy"]').forEach((r) => {
  r.addEventListener('change', compute);
});
$('model-reduction').addEventListener('change', compute);

// Corpus-size preset chips
document.querySelectorAll('.preset[data-target="corpus-size"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('corpus-size').value = btn.dataset.value;
    compute();
  });
});

compute();

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

(async function loadCorpus() {
  try {
    const response = await fetch('data/corpus_merged.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    initStatsPanel(data);
    initBrowser(data);
  } catch (err) {
    console.error('Failed to load corpus:', err);
    const msg = `Could not load corpus_merged.json (${err.message}). Serve over HTTP — file:// access is blocked by the browser.`;
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
//   A · Corpus at a glance — stats panel
// ═══════════════════════════════════════════════════════════

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const SOURCE_LABELS = {
  aco:            'ACO',
  shamela_ay:     'ShamelaAY',
  personal_other: 'Personal / Other',
};

function initStatsPanel(data) {
  renderBreakdownTable(data);
  renderHistogram(data);
  renderTopWorks(data);
  renderTopVolumes(data);
}

function renderBreakdownTable(data) {
  const rows = [];
  let totalVols = 0, totalPages = 0, totalWorks = 0;
  const allPagesGlobal = [];

  for (const src of ['aco', 'shamela_ay', 'personal_other']) {
    const recs = data.filter((r) => r.source === src);
    const withPages = recs.map((r) => r.pages).filter((p) => typeof p === 'number' && p > 0);
    const workIds = new Set(recs.map((r) => r.work_id).filter(Boolean));
    const sumPages = withPages.reduce((a, b) => a + b, 0);
    const avg = withPages.length ? Math.round(sumPages / withPages.length) : null;
    const med = median(withPages);

    rows.push({
      label: SOURCE_LABELS[src],
      vols:  recs.length,
      works: workIds.size,
      pages: sumPages,
      avg,
      median: med,
      hasWorks: src !== 'personal_other',
    });
    totalVols += recs.length;
    totalPages += sumPages;
    totalWorks += workIds.size;
    allPagesGlobal.push(...withPages);
  }

  rows.push({
    label: 'TOTAL',
    vols:  totalVols,
    works: totalWorks,
    pages: totalPages,
    avg:   Math.round(totalPages / allPagesGlobal.length),
    median: median(allPagesGlobal),
    hasWorks: true,
    isTotal: true,
  });

  $('breakdown-body').innerHTML = rows.map((r) => `
    <tr class="${r.isTotal ? 'total-row' : ''}">
      <td>${escapeHtml(r.label)}</td>
      <td class="num">${fmtN(r.vols)}</td>
      <td class="num">${r.hasWorks ? fmtN(r.works) : '—'}</td>
      <td class="num">${fmtN(r.pages)}</td>
      <td class="num">${r.avg != null ? fmtN(r.avg) : '—'}</td>
      <td class="num">${r.median != null ? fmtN(r.median) : '—'}</td>
    </tr>
  `).join('');
}

function renderHistogram(data) {
  const bins = [
    { label: '0 – 100',       min: 0,    max: 100,      count: 0 },
    { label: '101 – 300',     min: 101,  max: 300,      count: 0 },
    { label: '301 – 500',     min: 301,  max: 500,      count: 0 },
    { label: '501 – 1,000',   min: 501,  max: 1000,     count: 0 },
    { label: '1,001 – 3,000', min: 1001, max: 3000,     count: 0 },
    { label: '3,001 +',       min: 3001, max: Infinity, count: 0 },
  ];
  for (const r of data) {
    if (typeof r.pages !== 'number' || r.pages <= 0) continue;
    for (const b of bins) {
      if (r.pages >= b.min && r.pages <= b.max) { b.count++; break; }
    }
  }
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  $('histogram').innerHTML = bins.map((b) => `
    <div class="hist-bin">
      <div class="hist-label">${b.label}</div>
      <div class="hist-bar-wrap"><div class="hist-bar" style="width: ${(b.count / maxCount * 100).toFixed(1)}%"></div></div>
      <div class="hist-count">${fmtN(b.count)}</div>
    </div>
  `).join('');
}

// True when the title field looks like a catalog code or volume designation
// rather than a human-readable Arabic title. Used ONLY to clean up the
// "Largest works" and "Longest individual volumes" display lists — junk-titled
// records remain in the headline tiles, breakdown table, histogram, and the
// search/filter browser (researchers may still need to find them by code).
function looksLikeJunkTitle(title) {
  if (title == null) return true;
  const t = String(title).trim();
  if (t.length < 6) return true;
  if (!/[؀-ۿݐ-ݿ]/.test(t)) return true;
  if (/^[0-9\s_\-.]+$/.test(t)) return true;
  return false;
}

function renderTopWorks(data) {
  const byWork = new Map();
  for (const r of data) {
    if (!r.work_id) continue;
    let w = byWork.get(r.work_id);
    if (!w) {
      w = { count: 0, pages: 0, titles: [], author: '' };
      byWork.set(r.work_id, w);
    }
    w.count++;
    if (typeof r.pages === 'number' && r.pages > 0) w.pages += r.pages;
    if (r.title) w.titles.push(r.title);
    if (!w.author && r.author) w.author = r.author;
  }

  const works = [...byWork.values()]
    .map((w) => {
      const clean = w.titles.filter((t) => !looksLikeJunkTitle(t));
      if (clean.length === 0) return null;
      const title = clean.reduce((a, b) => (b.length > a.length ? b : a));
      return { count: w.count, pages: w.pages, author: w.author, title };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count || b.pages - a.pages)
    .slice(0, 10);

  $('top-works').innerHTML = works.map((w) => `
    <li>
      <span class="topn-title" dir="auto">${escapeHtml(w.title)}</span>
      <span class="topn-meta" dir="auto">${escapeHtml(w.author || '—')} · ${fmtN(w.count)} volumes · ${fmtN(w.pages)} pages</span>
    </li>
  `).join('');
}

function renderTopVolumes(data) {
  const top = data
    .filter((r) => typeof r.pages === 'number' && r.pages > 0)
    .filter((r) => !looksLikeJunkTitle(r.title))
    .sort((a, b) => b.pages - a.pages)
    .slice(0, 10);

  $('top-volumes').innerHTML = top.map((r) => `
    <li>
      <span class="topn-title" dir="auto">${escapeHtml(r.title || '—')}</span>
      <span class="topn-meta" dir="auto">${escapeHtml(r.author || '—')} · ${fmtN(r.pages)} pages</span>
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

function initBrowser(data) {
  BROWSER.data = data;
  BROWSER.byId = new Map(data.map((r) => [r.record_id, r]));

  // Build MiniSearch index
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

  // Populate discipline filter dropdown
  const counts = new Map();
  for (const r of data) {
    const key = r.discipline_normalized || '(unmapped)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const select = $('b-discipline');
  for (const [d, c] of sorted) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `${d} (${fmtN(c)})`;
    select.appendChild(opt);
  }

  // Enable controls
  ['b-search', 'b-source', 'b-discipline', 'b-year-from', 'b-year-to',
   'b-prev', 'b-next'].forEach((id) => { $(id).disabled = false; });

  // Wire events
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

  // Delegated click handler for rows + title buttons
  $('browse-body').addEventListener('click', handleBrowseClick);

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
    <td class="title-cell">${titleHtml}</td>
    <td class="author-cell" dir="auto">${escapeHtml(r.author || '—')}</td>
    <td class="num">${r.pub_year != null ? r.pub_year : '—'}</td>
    <td dir="auto">${escapeHtml(r.pub_place || '—')}</td>
    <td class="num">${typeof r.pages === 'number' ? fmtN(r.pages) : '—'}</td>
    <td class="disc-cell" dir="auto">${escapeHtml(discipline)}</td>
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
  const map = {
    aco:            { label: 'ACO',     cls: 'src-aco' },
    shamela_ay:     { label: 'Shamela', cls: 'src-shamela' },
    personal_other: { label: 'Other',   cls: 'src-other' },
  };
  const cfg = map[src] || { label: escapeHtml(src || '—'), cls: 'src-other' };
  return `<span class="src-badge ${cfg.cls}">${cfg.label}</span>`;
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
