const CORPUS = {
  records: 29908,
  pages: 10801340,
};

const WORKING_DAYS_PER_MONTH = 20;
const HOURS_PER_DAY = 8;

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmt1   = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const euro = (v) => '€ ' + fmtInt.format(Math.round(v));

const $ = (id) => document.getElementById(id);

function compute() {
  const ocr   = parseFloat($('ocr-cost').value)     || 0;
  const tag   = parseFloat($('tag-cost').value)     || 0;
  const ext   = parseFloat($('extract-cost').value) || 0;
  const rate  = parseFloat($('fte-rate').value)     || 0;
  const pd    = parseFloat($('pages-day').value)    || 1;
  const ftes  = Math.max(1, parseInt($('fte-count').value, 10) || 1);

  const apiCost   = (ocr + tag) * CORPUS.pages + ext * CORPUS.records;
  const fteHours  = (CORPUS.pages / pd) * HOURS_PER_DAY;
  const laborCost = fteHours * rate;
  const totalCost = apiCost + laborCost;
  const calMonths = CORPUS.pages / (pd * WORKING_DAYS_PER_MONTH * ftes);

  $('total-cost').textContent = euro(totalCost);
  $('api-cost').textContent   = euro(apiCost);
  $('labor-cost').textContent = euro(laborCost);
  $('fte-hours').textContent  = fmtInt.format(Math.round(fteHours));
  $('cal-months').textContent = fmt1.format(calMonths);
  $('cal-sub').textContent    =
    `with ${ftes} parallel FTE${ftes === 1 ? '' : 's'} at ${fmtInt.format(pd)} pages / FTE-day`;
}

function pair(sliderId, numberId) {
  const slider = $(sliderId);
  const number = $(numberId);
  slider.addEventListener('input', () => { number.value = slider.value; compute(); });
  number.addEventListener('input', () => { slider.value = number.value; compute(); });
}

[
  ['ocr-cost',     'ocr-cost-num'],
  ['tag-cost',     'tag-cost-num'],
  ['extract-cost', 'extract-cost-num'],
  ['fte-rate',     'fte-rate-num'],
  ['pages-day',    'pages-day-num'],
  ['fte-count',    'fte-count-num'],
].forEach(([s, n]) => pair(s, n));

compute();
