// Hardcoded corpus constants. These match the headline tiles and the values
// produced by data/corpus_merged.json; if that file changes, update here.
// (Future enhancement: fetch() data/corpus_merged.json and recompute live.)
const CORPUS = {
  pages: 10801340,
  records: 29908,
  tokensPerPage: 300,
};

const PROJECT_YEARS         = 21;
const DEV_YEARS_INTENSIVE   = 3;     // years 1–3
const DEV_YEARS_MAINTENANCE = 18;    // years 4–21
const HOURS_PER_WORKDAY     = 8;
const WORKDAYS_PER_YEAR     = 220;

const OCR_PATHS = {
  path1: { label: 'Datalab API consensus',      eurPer1k: 5.50, pagesPerHour: 3600 },
  path2: { label: 'Runpod self-host consensus', eurPer1k: 2.50, pagesPerHour: 5200 },
  path3: { label: 'Apple Silicon local',        eurPer1k: 1.50, pagesPerHour: 55   },
};

const fmt = {
  int: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  one: new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
};

const $    = (id) => document.getElementById(id);
const euro = (v)  => '€ ' + fmt.int.format(Math.round(v));

function selectedPath() {
  const el = document.querySelector('input[name="ocr-path"]:checked');
  return OCR_PATHS[el ? el.value : 'path1'];
}

function compute() {
  const path = selectedPath();

  // ── Inputs ──────────────────────────────────────────────
  const consensus   = parseFloat($('llm-consensus').value) || 0;
  const tagging     = parseFloat($('llm-tagging').value)   || 0;
  const biblio      = parseFloat($('llm-biblio').value)    || 0;

  const qcPct       = parseFloat($('qc-sample').value) || 0;
  const qcSeconds   = parseFloat($('qc-time').value)   || 0;
  const parallel    = Math.max(1, parseInt($('parallel').value, 10) || 1);

  const dhIntensive   = parseFloat($('dh-intensive').value)   || 0;
  const dhMaintenance = parseFloat($('dh-maintenance').value) || 0;
  const validationPct = parseFloat($('validation-pct').value) || 0;

  // Mirror team % into the labels
  $('dh-intensive-val').textContent   = fmt.int.format(dhIntensive);
  $('dh-maintenance-val').textContent = fmt.int.format(dhMaintenance);
  $('validation-val').textContent     = fmt.int.format(validationPct);

  // ── 1 · Monetary costs (€) ──────────────────────────────
  const ocrCost      = CORPUS.pages * (path.eurPer1k / 1000);
  const consensusEUR = CORPUS.pages   * consensus;
  const taggingEUR   = CORPUS.pages   * tagging;
  const biblioEUR    = CORPUS.records * biblio;
  const apiTotal     = ocrCost + consensusEUR + taggingEUR + biblioEUR;

  $('total-api-cost').textContent = euro(apiTotal);
  $('cost-ocr').textContent       = euro(ocrCost);
  $('cost-consensus').textContent = euro(consensusEUR);
  $('cost-tagging').textContent   = euro(taggingEUR);
  $('cost-biblio').textContent    = euro(biblioEUR);

  // ── 2 · Human time (FTE — never converted to €) ─────────
  const dhPY  = DEV_YEARS_INTENSIVE   * (dhIntensive   / 100)
              + DEV_YEARS_MAINTENANCE * (dhMaintenance / 100);
  const valPY = PROJECT_YEARS * (validationPct / 100);

  const qcPages    = CORPUS.pages * (qcPct / 100);
  const qcHours    = qcPages * (qcSeconds / 3600);
  const qcFTEYears = qcHours / (HOURS_PER_WORKDAY * WORKDAYS_PER_YEAR);

  $('dh-py').textContent      = fmt.one.format(dhPY)  + ' PY';
  $('val-py').textContent     = fmt.one.format(valPY) + ' PY';
  $('dh-py-sub').textContent  = '≈ ' + fmt.int.format(Math.round(dhPY  * 12)) + ' person-months';
  $('val-py-sub').textContent = '≈ ' + fmt.int.format(Math.round(valPY * 12)) + ' person-months';

  $('qc-hrs').textContent      = fmt.int.format(Math.round(qcHours)) + ' FTE-hours';
  $('qc-fte-years').textContent = '≈ ' + fmt.one.format(qcFTEYears) + ' FTE-years';

  $('dh-total').textContent  = fmt.one.format(dhPY);
  $('val-total').textContent = fmt.one.format(valPY);

  // ── 3 · Schedule (wall-clock) ───────────────────────────
  const wallHours = CORPUS.pages / (path.pagesPerHour * parallel);
  const wallDays  = wallHours / 24;
  const wallWeeks = wallDays / 7;

  $('ocr-wall').textContent     = fmt.int.format(Math.round(wallHours)) + ' hours';
  $('ocr-wall-sub').textContent =
    `${fmt.one.format(wallDays)} days · ${fmt.one.format(wallWeeks)} weeks · `
    + `${parallel} parallel × ${fmt.int.format(path.pagesPerHour)} pages/hr (continuous run)`;
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
  ['qc-sample',     'qc-sample-num'],
  ['qc-time',       'qc-time-num'],
  ['parallel',      'parallel-num'],
].forEach(([s, n]) => pair(s, n));

// Single-slider rows (team composition)
['dh-intensive', 'dh-maintenance', 'validation-pct'].forEach((id) => {
  $(id).addEventListener('input', compute);
});

// OCR path radio
document.querySelectorAll('input[name="ocr-path"]').forEach((r) => {
  r.addEventListener('change', compute);
});

compute();
