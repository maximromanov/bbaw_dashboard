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
