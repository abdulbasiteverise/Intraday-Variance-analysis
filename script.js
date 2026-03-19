/**
 * ═══════════════════════════════════════════════════════════
 * INTRADAY INTELLIGENCE DASHBOARD  —  script.js  v4
 * Author: Abdul Basit | Workforce Intelligence Suite
 *
 * v4 Additions:
 *   §20  Spike Severity Classification (Mild / Major / Critical)
 *   §21  Historical Variability Index (Forecast Reliability)
 *   §22  Enhanced Traffic Pattern Classification (6 patterns)
 *   §23  Data Source Mode (Manual / Auto + CSV Upload)
 *   §24  Intraday Reforecast Engine (cumActual + remaining pattern)
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────────
   §1  INTERVALS
───────────────────────────────────────────────────────── */
function genIntervals(startH, endH) {
  const out = [];
  for (let h = startH; h <= endH; h++) {
    const mins = (h === endH) ? [0] : [0, 15, 30, 45];
    mins.forEach(m => out.push(`${h}:${String(m).padStart(2, '0')}`));
  }
  return out;
}
const INTERVALS = genIntervals(8, 23);
const N = INTERVALS.length; // 61
const DEFAULT_WEEK_COUNT = 5;

/* ─────────────────────────────────────────────────────────
   §2  APPLICATION STATE
───────────────────────────────────────────────────────── */
const state = {
  rows: [],
  weeksData: Array.from({ length: DEFAULT_WEEK_COUNT }, (_, i) => ({ label: `WK -${i + 1}`, values: [] })),
  analysis: null,
  dailyForecast: null,
  availableCapacity: null,
  dataMode: 'manual', // 'manual' | 'auto'
};

/* ─────────────────────────────────────────────────────────
   §3  BUILD TABLE
───────────────────────────────────────────────────────── */
function syncWeeksDataFromRows() {
  state.weeksData.forEach((wk, d) => {
    wk.values = state.rows.map(r => (r?.days?.[d] ?? null));
  });
}

function restoreRowsFromWeeksData(previousRows) {
  state.rows = INTERVALS.map((_, i) => {
    const prev = previousRows?.[i];
    return {
      days: state.weeksData.map((wk, d) => wk.values?.[i] ?? prev?.days?.[d] ?? null),
      today: prev?.today ?? null,
    };
  });
}

function renderWeeks() {
  const pasteGrid = document.getElementById('pasteGrid');
  const groupHeader = document.getElementById('tableGroupHeaderRow');
  const subHeader = document.getElementById('tableSubHeaderRow');
  if (!pasteGrid || !groupHeader || !subHeader) return;

  const weekCount = state.weeksData.length;
  const histGroup = groupHeader.querySelector('.th-group--hist');
  if (histGroup) histGroup.colSpan = weekCount;

  subHeader.querySelectorAll('.th-week').forEach(el => el.remove());
  const histAnchor = subHeader.querySelector('.th-hist');
  state.weeksData.forEach((wk, d) => {
    const th = document.createElement('th');
    th.className = 'th-sub th-week';
    th.dataset.tip = `Call volume ${d + 1} week${d === 0 ? '' : 's'} ago.`;
    th.textContent = wk.label.replace('WK', 'Wk').replace('-', '−');
    subHeader.insertBefore(th, histAnchor);
  });

  pasteGrid.innerHTML = '';
  state.weeksData.forEach((wk, d) => {
    const col = document.createElement('div');
    col.className = 'paste-col fade-in-col';
    col.innerHTML = `
      <div class="paste-col-label"><span class="week-badge week-badge--hist">${wk.label.replace('-', '−')}</span></div>
      <textarea class="paste-ta" id="pasteW${d + 1}" rows="5"></textarea>
      <button class="btn btn--apply" data-col="${d}">Apply</button>
    `;
    const ta = col.querySelector('textarea');
    const values = wk.values.filter(v => v !== null);
    if (values.length) ta.value = wk.values.map(v => (v ?? '')).join('\n');
    pasteGrid.appendChild(col);
  });

  const todayCol = document.createElement('div');
  todayCol.className = 'paste-col paste-col--today';
  todayCol.innerHTML = `
    <div class="paste-col-label"><span class="week-badge week-badge--today">Today Actual</span></div>
    <textarea class="paste-ta paste-ta--today" id="pasteToday" rows="5"></textarea>
    <button class="btn btn--apply btn--apply-today" data-col="today">Apply</button>
  `;
  todayCol.querySelector('#pasteToday').value = state.rows.map(r => (r.today ?? '')).join('\n');
  pasteGrid.appendChild(todayCol);
}

function buildTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  INTERVALS.forEach((interval, i) => {
    const row = state.rows[i] || { days: state.weeksData.map(() => null), today: null };
    state.rows[i] = row;

    const tr = document.createElement('tr');
    tr.id = `row-${i}`;
    tr.dataset.i = i;

    const tdLabel = document.createElement('td');
    tdLabel.className = 'td-sticky';
    tdLabel.textContent = interval;
    tr.appendChild(tdLabel);

    for (let d = 0; d < state.weeksData.length; d++) {
      const td = document.createElement('td');
      td.className = 'td-week';
      const inp = makeNumInput(`w${d}-${i}`, `Week -${d + 1} calls at ${interval}`);
      inp.value = row.days[d] ?? '';
      inp.addEventListener('input', () => {
        row.days[d] = parseFloat(inp.value) || null;
        state.weeksData[d].values[i] = row.days[d];
        scheduleRecalc();
      });
      td.appendChild(inp);
      tr.appendChild(td);
    }

    addTd(tr, `ha-${i}`,  'td-hist');
    addTd(tr, `arr-${i}`, 'td-arrival');

    const tdToday = document.createElement('td');
    tdToday.className = 'td-today';
    const todayInp = makeNumInput(`t-${i}`, `Today actual at ${interval}`);
    todayInp.value = row.today ?? '';
    todayInp.addEventListener('input', () => {
      row.today = parseFloat(todayInp.value) || null;
      scheduleRecalc();
    });
    tdToday.appendChild(todayInp);
    tr.appendChild(tdToday);

    addTd(tr, `dev-${i}`,  '');
    addTd(tr, `cmpl-${i}`, 'td-cmpl');
    addTd(tr, `hp-${i}`,   'td-histp');
    addTd(tr, `rr-${i}`,   'td-rr');
    addTd(tr, `rfcast-${i}`, 'td-reforecast');
    addTd(tr, `bl-${i}`,   'td-blended');
    addTd(tr, `cf-${i}`,   '');
    addTd(tr, `rem-${i}`,  'td-rem');
    addTd(tr, `blg-${i}`,  '');

    tbody.appendChild(tr);
  });
}

function makeNumInput(id, label) {
  const inp = document.createElement('input');
  inp.type = 'number'; inp.id = id; inp.min = '0'; inp.step = '1';
  inp.setAttribute('aria-label', label);
  return inp;
}
function addTd(tr, id, cls) {
  const td = document.createElement('td');
  td.id = id; if (cls) td.className = cls; td.textContent = '—';
  tr.appendChild(td); return td;
}

/* ─────────────────────────────────────────────────────────
   §4  CORE CALCULATIONS
───────────────────────────────────────────────────────── */
function calcHistAvg() {
  return state.rows.map(row => {
    const vals = row.days.filter(v => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  });
}

function calcArrivalPattern(histAvgs) {
  const total = histAvgs.reduce((s, v) => s + (v || 0), 0);
  if (!total) return new Array(N).fill(null);
  return histAvgs.map(v => (v !== null ? v / total : null));
}

function calcHistCompletion(histAvgs) {
  const total = histAvgs.reduce((s, v) => s + (v || 0), 0);
  if (!total) return new Array(N).fill(null);
  let cum = 0;
  return histAvgs.map(v => { cum += (v || 0); return cum / total; });
}

function calcDeviation(histAvgs) {
  return state.rows.map((row, i) => {
    const h = histAvgs[i], t = row.today;
    if (h === null || t === null || h === 0) return null;
    return ((t - h) / h) * 100;
  });
}

function calcCumActual() {
  let cum = 0;
  return state.rows.map(row => {
    if (row.today !== null) cum += row.today;
    return row.today !== null ? cum : null;
  });
}

function calcCumHist(histAvgs) {
  let cum = 0;
  return histAvgs.map(v => { cum += (v || 0); return v !== null ? cum : null; });
}

function calcHistProj(arrivalPct, dailyForecast) {
  if (!dailyForecast) return new Array(N).fill(null);
  return arrivalPct.map(a => (a !== null ? dailyForecast * a : null));
}

/* §7 Run-Rate: actual pace projection (cumActual + pace × remaining) */
function calcRunRate(cumActual, histCompletion) {
  const elapsed = new Array(N).fill(0);
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (state.rows[i].today !== null) count++;
    elapsed[i] = count;
  }
  return cumActual.map((cum, i) => {
    if (cum === null || elapsed[i] === 0) return null;
    const ratePerInterval = cum / elapsed[i];
    const remaining = N - elapsed[i];
    return cum + ratePerInterval * remaining;
  });
}

/* §24  INTRADAY REFORECAST ENGINE
 * ReforecastEOD = CumActual + (DailyForecast × (1 − HistCompletion))
 * Uses actual arrivals to date + remaining pattern from daily forecast.
 * If no dailyForecast, falls back to run-rate.
 */
function calcReforecast(cumActual, histCompletion, dailyForecast) {
  return cumActual.map((cum, i) => {
    if (cum === null) return null;
    if (!dailyForecast) return null;
    const comp = histCompletion[i] || 0;
    const remainingPattern = dailyForecast * (1 - comp);
    return cum + remainingPattern;
  });
}

function calcBlended(runRate, histCompletion, dailyForecast) {
  return runRate.map((rr, i) => {
    if (rr === null) return null;
    const comp = histCompletion[i] || 0;
    let wH, wR;
    if      (comp < 0.25) { wH = 0.7; wR = 0.3; }
    else if (comp < 0.60) { wH = 0.5; wR = 0.5; }
    else                  { wH = 0.3; wR = 0.7; }
    return dailyForecast ? (wH * dailyForecast + wR * rr) : rr;
  });
}

function calcRemaining(blended, cumActual) {
  return blended.map((b, i) => {
    if (b === null || cumActual[i] === null) return null;
    return Math.max(0, Math.round(b - cumActual[i]));
  });
}

function calcConfidence(devs, histCompletion, blended, dailyForecast) {
  return devs.map((dev, i) => {
    if (dev === null) return null;
    let score = 100;
    const absD = Math.abs(dev);
    if (absD > 10) score -= 40;
    else if (absD > 5) score -= 20;
    const comp = histCompletion[i] || 0;
    if (comp < 0.25) score -= 20;
    else if (comp < 0.50) score -= 10;
    const b = blended[i];
    if (b !== null && dailyForecast) {
      const diff = Math.abs((b - dailyForecast) / dailyForecast) * 100;
      if (diff > 10) score -= 15;
      else if (diff > 5) score -= 8;
    }
    if (score >= 70) return { level: 'high', label: 'High' };
    if (score >= 45) return { level: 'med',  label: 'Medium' };
    return               { level: 'low',  label: 'Low' };
  });
}

function calcBacklog(remaining, histCompletion, availCap) {
  return remaining.map((rem, i) => {
    if (rem === null) return null;
    if (!availCap) return { status: 'safe', label: 'Safe' };
    const comp = histCompletion[i] || 0;
    const remCap = availCap * (1 - comp);
    if (remCap <= 0) return { status: 'safe', label: 'Safe' };
    const diff = rem - remCap;
    if (diff <= 0) return { status: 'safe', label: 'Safe' };
    if (diff / remCap <= 0.10) return { status: 'risk', label: 'Risk' };
    return { status: 'crit', label: 'Critical' };
  });
}

/* ─────────────────────────────────────────────────────────
   §20  SPIKE SEVERITY CLASSIFICATION
   Three levels based on deviation % AND positive acceleration:
     Mild     — deviation >  5% AND accel > 0
     Major    — deviation > 10% AND accel > 0
     Critical — deviation > 15% AND accel > 0
───────────────────────────────────────────────────────── */
function calcSpikeStatus(histAvgs) {
  const result = new Array(N).fill(null).map(() => ({ level: 'none', severity: null, accel: 0, dev: 0 }));
  let consecutivePositiveAccel = 0;

  for (let i = 0; i < N; i++) {
    const today = state.rows[i].today;
    const hist  = histAvgs[i];
    if (today === null || hist === null || hist === 0) {
      consecutivePositiveAccel = 0;
      continue;
    }

    const dev   = ((today - hist) / hist) * 100;
    const prev  = i > 0 ? state.rows[i - 1].today : null;
    const accel = prev !== null ? today - prev : 0;

    if (accel > 0) consecutivePositiveAccel++;
    else           consecutivePositiveAccel = 0;

    let level = 'none', severity = null;

    if (accel > 0) {
      if      (dev > 15) { level = 'critical'; severity = 'Critical Spike'; }
      else if (dev > 10) { level = 'major';    severity = 'Major Spike'; }
      else if (dev > 5)  { level = 'mild';     severity = 'Mild Spike'; }
    } else if (consecutivePositiveAccel >= 2 && dev > 5 && dev <= 10) {
      level = 'mild'; severity = 'Mild Spike';
    }

    result[i] = { level, severity, accel, dev };
  }
  return result;
}

/* Summarise: worst severity in last 4 data intervals */
function summariseSpike(spikeArr) {
  let lastDataIdx = -1;
  for (let i = N - 1; i >= 0; i--) {
    if (state.rows[i].today !== null) { lastDataIdx = i; break; }
  }
  if (lastDataIdx < 0) return { level: 'none', idx: -1, severity: null };

  const ORDER = { critical: 3, major: 2, mild: 1, none: 0 };
  const windowStart = Math.max(0, lastDataIdx - 3);
  let worst = { level: 'none', idx: -1, severity: null };
  for (let i = windowStart; i <= lastDataIdx; i++) {
    const sp = spikeArr[i];
    if (!sp) continue;
    if ((ORDER[sp.level] || 0) > (ORDER[worst.level] || 0)) {
      worst = { level: sp.level, idx: i, severity: sp.severity };
    }
  }
  return worst;
}

/* ─────────────────────────────────────────────────────────
   §21  HISTORICAL VARIABILITY INDEX
   StdDev / HistAvg per interval → Variability Index
   Classify: <10% Stable · 10–20% Moderate · >20% High
───────────────────────────────────────────────────────── */
function calcVariabilityIndex(histAvgs) {
  const perInterval = state.rows.map((row, i) => {
    const vals = row.days.filter(v => v !== null);
    if (vals.length < 2) return null;
    const mean = histAvgs[i];
    if (!mean) return null;
    const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
    const stdDev   = Math.sqrt(variance);
    return stdDev / mean; // coefficient of variation (0–1 scale)
  });

  // Overall variability = mean of interval CVs
  const valid = perInterval.filter(v => v !== null);
  if (!valid.length) return null;
  const avgCV = valid.reduce((s, v) => s + v, 0) / valid.length;
  const pct   = avgCV * 100;

  let cls, label, sublabel;
  if      (pct < 10) { cls = 'var-stable';   label = 'Stable Pattern';       sublabel = `Variability: ${pct.toFixed(1)}%`; }
  else if (pct < 20) { cls = 'var-moderate'; label = 'Moderate Variability'; sublabel = `Variability: ${pct.toFixed(1)}%`; }
  else               { cls = 'var-high';     label = 'High Variability';      sublabel = 'Forecast confidence low'; }

  return { pct, cls, label, sublabel, perInterval };
}

/* ─────────────────────────────────────────────────────────
   §13  FORECAST ACCURACY  (MAPE-based)
───────────────────────────────────────────────────────── */
function calcForecastAccuracy(blended) {
  const actualTotal = state.rows.reduce((s, r) => s + (r.today || 0), 0);
  if (!actualTotal) return null;
  let latestBlended = null;
  for (let i = N - 1; i >= 0; i--) {
    if (blended[i] !== null) { latestBlended = blended[i]; break; }
  }
  if (latestBlended === null) return null;
  const errorPct = Math.abs(actualTotal - latestBlended) / actualTotal * 100;
  const accuracy = Math.max(0, 100 - errorPct);
  let cls, label;
  if      (accuracy >= 95) { cls = 'acc-excellent';  label = 'Excellent'; }
  else if (accuracy >= 90) { cls = 'acc-good';        label = 'Good'; }
  else if (accuracy >= 85) { cls = 'acc-acceptable';  label = 'Acceptable'; }
  else                     { cls = 'acc-poor';         label = 'Needs improvement'; }
  return { accuracy, errorPct, cls, label };
}

/* ─────────────────────────────────────────────────────────
   §5  SUMMARY HELPERS
───────────────────────────────────────────────────────── */
function calcOverallVariance(devs) {
  const v = devs.filter(d => d !== null);
  return v.length ? v.reduce((s, d) => s + d, 0) / v.length : null;
}
function findSpike(devs) {
  let max = -Infinity, idx = -1;
  devs.forEach((d, i) => { if (d !== null && d > max) { max = d; idx = i; } });
  return idx === -1 ? null : { interval: INTERVALS[idx], deviation: max };
}
function findDip(devs) {
  let min = Infinity, idx = -1;
  devs.forEach((d, i) => { if (d !== null && d < min) { min = d; idx = i; } });
  return idx === -1 ? null : { interval: INTERVALS[idx], deviation: min };
}
function calcPeriods(devs) {
  const defs = {
    morning:   { label: 'Morning   (8:00–10:45)',  r: [0,  11] },
    midday:    { label: 'Midday    (11:00–13:45)', r: [12, 23] },
    afternoon: { label: 'Afternoon (14:00–17:45)', r: [24, 39] },
    evening:   { label: 'Evening   (18:00–23:00)', r: [40, 60] },
  };
  const out = {};
  Object.entries(defs).forEach(([k, { label, r }]) => {
    const slice = devs.slice(r[0], r[1] + 1).filter(d => d !== null);
    out[k] = { label, avg: slice.length ? slice.reduce((s, d) => s + d, 0) / slice.length : null };
  });
  return out;
}

/* ─────────────────────────────────────────────────────────
   §22  ENHANCED TRAFFIC PATTERN CLASSIFICATION
   Patterns: Normal · Front-Loaded · Delayed Peak ·
             Midday Spike · Evening Surge · Double Peak
───────────────────────────────────────────────────────── */
function detectPattern(periods) {
  const m = periods.morning.avg;
  const md = periods.midday.avg;
  const a  = periods.afternoon.avg;
  const e  = periods.evening?.avg;

  if (m === null && md === null && a === null) return { label: '—', cls: '' };

  // Double Peak: both morning AND afternoon elevated, midday dips
  if (m !== null && a !== null && md !== null) {
    if (m > 5 && a > 5 && md < -2) return { label: 'Double Peak',    cls: 'tp-double' };
  }
  // Midday Spike: midday elevated, morning and afternoon relatively flat
  if (md !== null && md > 8) {
    if ((m === null || Math.abs(m) <= 3) && (a === null || Math.abs(a) <= 3)) {
      return { label: 'Midday Spike', cls: 'tp-midday' };
    }
  }
  // Front Loaded: morning elevated, afternoon low
  if (m !== null && a !== null) {
    if (m > 5 && a < -2) return { label: 'Front-Loaded',  cls: 'tp-front' };
    if (m < -5 && a > 5) return { label: 'Delayed Peak',  cls: 'tp-delayed' };
  }
  // Evening Surge
  if (e !== null && e > 8) return { label: 'Evening Surge', cls: 'tp-surge' };

  return { label: 'Normal Pattern', cls: 'tp-normal' };
}

function detectStatus(ov) {
  if (ov === null) return { label: '—', cls: '' };
  const a = Math.abs(ov);
  if (a <= 5)  return { label: 'NORMAL',         cls: 'card-normal' };
  if (a <= 10) return { label: 'DRIFTING',        cls: 'card-drifting' };
  return              { label: 'MAJOR DEVIATION', cls: 'card-major' };
}
function detectRisk(ov) {
  if (ov === null) return { label: '—', cls: '', msg: '' };
  const a = Math.abs(ov);
  if (a <= 5)  return { label: 'LOW',      cls: 'risk-low',      msg: 'Staffing alignment within acceptable tolerance.' };
  if (a <= 10) return { label: 'MODERATE', cls: 'risk-moderate', msg: 'Monitor before adjusting staffing.' };
  return              { label: 'HIGH',     cls: 'risk-high',      msg: 'Pattern deviation may impact staffing alignment.' };
}

/* ─────────────────────────────────────────────────────────
   §6  UPDATE TABLE CELLS
───────────────────────────────────────────────────────── */
function updateCells(histAvgs, arrivalPct, histCompletion, devs, histProj,
                     runRate, reforecast, blended, confidence, remaining, backlog, spikeArr) {
  const fmtN = v => v !== null ? v.toFixed(1) : '—';
  const fmtI = v => v !== null ? Math.round(v).toLocaleString() : '—';
  const fmtP = v => v !== null ? (v * 100).toFixed(1) + '%' : '—';

  for (let i = 0; i < N; i++) {
    const tr = document.getElementById(`row-${i}`);
    if (tr) {
      tr.classList.remove('row-spike-mild', 'row-spike-major', 'row-spike-critical');
      const sp = spikeArr[i];
      if (sp && sp.level === 'mild')     tr.classList.add('row-spike-mild');
      if (sp && sp.level === 'major')    tr.classList.add('row-spike-major');
      if (sp && sp.level === 'critical') tr.classList.add('row-spike-critical');
    }

    set(`ha-${i}`,   fmtN(histAvgs[i]));
    set(`arr-${i}`,  fmtP(arrivalPct[i]));
    set(`cmpl-${i}`, fmtP(histCompletion[i]));
    set(`hp-${i}`,   fmtI(histProj[i]));
    set(`rr-${i}`,   fmtI(runRate[i]));
    set(`rfcast-${i}`, fmtI(reforecast[i])); // §24
    set(`bl-${i}`,   fmtI(blended[i]));
    set(`rem-${i}`,  remaining[i] !== null ? remaining[i].toLocaleString() : '—');

    // Deviation badge
    const devEl = document.getElementById(`dev-${i}`);
    if (devEl) {
      const d = devs[i];
      if (d === null) { devEl.innerHTML = '<span class="dev-nil">—</span>'; }
      else {
        const a = Math.abs(d);
        const cls = a <= 5 ? 'dev-green' : a <= 10 ? 'dev-yellow' : 'dev-red';
        devEl.innerHTML = `<span class="dev-badge ${cls}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>`;
      }
    }

    // Confidence badge
    const cfEl = document.getElementById(`cf-${i}`);
    if (cfEl) {
      const c = confidence[i];
      cfEl.innerHTML = c
        ? `<span class="conf-badge conf-${c.level}"><span class="conf-dot"></span>${c.label}</span>`
        : '—';
    }

    // Backlog badge
    const blgEl = document.getElementById(`blg-${i}`);
    if (blgEl) {
      const b = backlog[i];
      if (!b) { blgEl.textContent = '—'; }
      else {
        const cls = b.status === 'safe' ? 'bl-safe' : b.status === 'risk' ? 'bl-risk' : 'bl-crit';
        blgEl.innerHTML = `<span class="bl-badge ${cls}">${b.label}</span>`;
      }
    }
  }
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ─────────────────────────────────────────────────────────
   §7  KPI STRIP + METRIC CARDS
───────────────────────────────────────────────────────── */
function updateKPIs(a) {
  const fmt    = v => v !== null ? Math.round(v).toLocaleString() : '—';
  const fmtPct = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

  let lastI = -1;
  for (let i = N - 1; i >= 0; i--) { if (a.cumActual[i] !== null) { lastI = i; break; } }

  // Traffic pattern (§22 enhanced)
  const tpEl = document.getElementById('trafficPattern');
  if (tpEl) tpEl.innerHTML = a.trafficPattern.label !== '—'
    ? `<span class="${a.trafficPattern.cls}">${a.trafficPattern.label}</span>` : '—';

  set('siCumActual',   lastI >= 0 ? fmt(a.cumActual[lastI]) : '—');
  const expNow = lastI >= 0 ? a.cumHist[lastI] : null;
  set('siCumExpected', fmt(expNow));

  // Variance %
  const vPct = (expNow && expNow > 0 && lastI >= 0 && a.cumActual[lastI] !== null)
    ? ((a.cumActual[lastI] - expNow) / expNow) * 100 : null;
  const varEl = document.getElementById('siVariancePct');
  if (varEl) {
    varEl.textContent = fmtPct(vPct);
    varEl.style.color = vPct === null ? '' :
      Math.abs(vPct) <= 5 ? 'var(--em)' :
      Math.abs(vPct) <= 10 ? 'var(--am)' : 'var(--rose)';
  }

  // Run-rate
  let latRR = null;
  for (let i = N - 1; i >= 0; i--) { if (a.runRate[i] !== null) { latRR = a.runRate[i]; break; } }
  set('siRunRate', fmt(latRR));

  // Historical projection
  let latHP = null;
  for (let i = N - 1; i >= 0; i--) { if (a.histProj[i] !== null) { latHP = a.histProj[i]; break; } }
  set('siHistProj', latHP !== null ? Math.round(a.dailyForecast || latHP).toLocaleString()
    : (a.dailyForecast ? Math.round(a.dailyForecast).toLocaleString() : '—'));

  // Reforecast KPI §24
  let latRF = null;
  for (let i = N - 1; i >= 0; i--) { if (a.reforecast[i] !== null) { latRF = a.reforecast[i]; break; } }
  set('siReforecast', fmt(latRF));

  // Blended
  let latBl = null;
  for (let i = N - 1; i >= 0; i--) { if (a.blended[i] !== null) { latBl = a.blended[i]; break; } }
  set('siBlended', fmt(latBl));

  // Confidence
  let latCf = null;
  for (let i = N - 1; i >= 0; i--) { if (a.confidence[i] !== null) { latCf = a.confidence[i]; break; } }
  const cfEl = document.getElementById('siConfidence');
  if (cfEl) {
    if (latCf) {
      cfEl.textContent = latCf.label;
      cfEl.style.color = latCf.level === 'high' ? 'var(--em)' :
                         latCf.level === 'med'  ? 'var(--am)' : 'var(--rose)';
    } else { cfEl.textContent = '—'; cfEl.style.color = ''; }
  }

  // Backlog
  let latBg = null;
  for (let i = N - 1; i >= 0; i--) { if (a.backlog[i] !== null) { latBg = a.backlog[i]; break; } }
  const bgEl = document.getElementById('siBacklog');
  if (bgEl) {
    if (latBg) {
      bgEl.textContent = latBg.label;
      bgEl.style.color = latBg.status === 'safe' ? 'var(--em)' :
                         latBg.status === 'risk' ? 'var(--am)' : 'var(--rose)';
    } else { bgEl.textContent = '—'; bgEl.style.color = ''; }
  }

  // Forecast accuracy
  const fcEl = document.getElementById('siFcstAccuracy');
  if (fcEl) {
    if (a.accuracy) {
      fcEl.textContent = a.accuracy.accuracy.toFixed(1) + '%';
      fcEl.style.color = a.accuracy.cls.includes('excellent') ? 'var(--em)' :
                         a.accuracy.cls.includes('good')       ? 'var(--cyan)' :
                         a.accuracy.cls.includes('acceptable') ? 'var(--am)' : 'var(--rose)';
    } else { fcEl.textContent = '—'; fcEl.style.color = ''; }
  }

  // ── METRIC CARDS ──

  // Status card
  const sCd = document.getElementById('card-status');
  sCd.classList.remove('card-normal', 'card-drifting', 'card-major');
  if (a.status.cls) sCd.classList.add(a.status.cls);
  anim('statusValue', a.status.label);
  set('statusTag', a.overallVariance !== null ? `Avg: ${fmtPct(a.overallVariance)}` : 'Awaiting data');

  // Avg deviation card
  anim('cumulativeValue', fmtPct(a.overallVariance));

  // Blended card
  anim('blendedValue', fmt(latBl));
  set('blendedTag', latBl ? 'EOD estimate (blended model)' : 'Enter today actual data');

  // §24 Reforecast card
  anim('reforecastValue', fmt(latRF));
  if (latRF !== null && a.dailyForecast) {
    const diff = ((latRF - a.dailyForecast) / a.dailyForecast * 100);
    set('reforecastTag', `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs Daily Forecast`);
  } else {
    set('reforecastTag', 'Requires daily forecast & actuals');
  }

  // §20 Spike card — severity display
  const spkCd = document.getElementById('card-spike');
  spkCd.classList.remove('spike-clear', 'spike-mild', 'spike-major', 'spike-critical');
  const sv = a.spikeSummary;
  if (sv.level === 'critical') {
    spkCd.classList.add('spike-critical');
    anim('spikeStatus', '🚨 Critical Spike');
    set('spikeDetail', `${INTERVALS[sv.idx]} — extreme volume surge`);
  } else if (sv.level === 'major') {
    spkCd.classList.add('spike-major');
    anim('spikeStatus', '🔥 Major Spike');
    set('spikeDetail', `${INTERVALS[sv.idx]} — significant acceleration`);
  } else if (sv.level === 'mild') {
    spkCd.classList.add('spike-mild');
    anim('spikeStatus', '⚠ Mild Spike');
    set('spikeDetail', `${INTERVALS[sv.idx]} — above expected, rising`);
  } else {
    spkCd.classList.add('spike-clear');
    anim('spikeStatus', 'Clear');
    set('spikeDetail', 'No spike detected');
  }

  // §21 Forecast Reliability card
  const varCard = document.getElementById('card-variability');
  if (varCard && a.variability) {
    varCard.classList.remove('var-stable', 'var-moderate', 'var-high');
    varCard.classList.add(a.variability.cls);
    anim('variabilityValue', a.variability.label);
    set('variabilityTag', a.variability.sublabel);
  } else if (varCard) {
    anim('variabilityValue', '—');
    set('variabilityTag', 'Needs 2+ weeks of data');
  }

  // Accuracy card
  const accCd = document.getElementById('card-accuracy');
  accCd.classList.remove('acc-excellent', 'acc-good', 'acc-acceptable', 'acc-poor');
  if (a.accuracy) {
    accCd.classList.add(a.accuracy.cls);
    anim('accuracyValue', a.accuracy.accuracy.toFixed(1) + '%');
    set('accuracyTag', `${a.accuracy.label} · Error: ${a.accuracy.errorPct.toFixed(1)}%`);
  } else {
    anim('accuracyValue', '—');
    set('accuracyTag', 'Needs day-end data');
  }
}

function anim(id, txt) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.opacity = '.3';
  el.style.transform = 'scale(.92)';
  requestAnimationFrame(() => {
    el.textContent = txt;
    el.style.transition = 'opacity .2s ease, transform .2s ease';
    el.style.opacity = '1';
    el.style.transform = 'scale(1)';
  });
}

/* ─────────────────────────────────────────────────────────
   §14  OPERATIONAL INSIGHTS
───────────────────────────────────────────────────────── */
function buildInsights(a) {
  const { overallVariance, trafficPattern, runRate, blended, reforecast,
          periods, spike, dip, backlog, dailyForecast, spikeSummary, variability } = a;

  if (overallVariance === null) {
    return [{ cls: 'ins-blue', icon: 'ℹ️', msg: 'Enter historical and today\'s data to generate live operational insights.' }];
  }

  const items = [];
  const latRR = runRate.reduce((v, x, i) => x !== null ? x : v, null);
  const latRF = reforecast.reduce((v, x) => x !== null ? x : v, null);

  // §20 Spike severity insight
  if (spikeSummary.level === 'critical') {
    items.push({ cls: 'ins-red', icon: '🚨', msg: `CRITICAL spike at ${INTERVALS[spikeSummary.idx]}. Volume surging >15% above expected with strong acceleration. Immediate intraday reforecast required.` });
  } else if (spikeSummary.level === 'major') {
    items.push({ cls: 'ins-red', icon: '🔥', msg: `Major spike at ${INTERVALS[spikeSummary.idx]}. Deviation exceeds 10% with positive acceleration. Initiate intraday reforecast review.` });
  } else if (spikeSummary.level === 'mild') {
    items.push({ cls: 'ins-orange', icon: '⚠️', msg: `Mild spike signal at ${INTERVALS[spikeSummary.idx]}. Volume trending above forecast with upward momentum. Monitor closely.` });
  }

  // §21 Variability warning
  if (variability && variability.cls === 'var-high') {
    items.push({ cls: 'ins-yellow', icon: '📊', msg: `High historical variability (${variability.pct.toFixed(1)}%) detected. Historical pattern is unstable — forecast confidence is lower than usual.` });
  }

  // Volume level
  if (overallVariance > 10)
    items.push({ cls: 'ins-red',    icon: '🔴', msg: `Volume running ${overallVariance.toFixed(1)}% above historical. Staffing pressure is high.` });
  else if (overallVariance > 5)
    items.push({ cls: 'ins-yellow', icon: '⚠️', msg: `Traffic moderately above forecast (+${overallVariance.toFixed(1)}%). Monitor before adjusting.` });
  else if (overallVariance < -10)
    items.push({ cls: 'ins-blue',   icon: '📉', msg: `Volume ${Math.abs(overallVariance).toFixed(1)}% below historical — likely surplus capacity.` });
  else if (overallVariance < -5)
    items.push({ cls: 'ins-blue',   icon: '📊', msg: `Traffic slightly below forecast (${overallVariance.toFixed(1)}%). Within manageable range.` });
  else
    items.push({ cls: 'ins-green',  icon: '✅', msg: `Volume tracking normally (${overallVariance.toFixed(1)}%). No staffing action required.` });

  // §24 Reforecast vs daily forecast divergence
  if (latRF !== null && dailyForecast) {
    const rfDiff = ((latRF - dailyForecast) / dailyForecast) * 100;
    if (rfDiff > 5)
      items.push({ cls: 'ins-red',  icon: '🔮', msg: `Reforecast (${Math.round(latRF).toLocaleString()}) suggests EOD will exceed daily forecast by ${rfDiff.toFixed(1)}%. Staffing review recommended.` });
    else if (rfDiff < -5)
      items.push({ cls: 'ins-blue', icon: '🔮', msg: `Reforecast (${Math.round(latRF).toLocaleString()}) tracking ${Math.abs(rfDiff).toFixed(1)}% below daily forecast.` });
  }

  // Traffic pattern
  if (trafficPattern.label === 'Front-Loaded')
    items.push({ cls: 'ins-yellow', icon: '🕗', msg: 'Front-loaded pattern. Expect lower volumes in the afternoon.' });
  else if (trafficPattern.label === 'Delayed Peak')
    items.push({ cls: 'ins-blue',   icon: '🕑', msg: 'Delayed peak — ensure afternoon staffing is in place.' });
  else if (trafficPattern.label === 'Evening Surge')
    items.push({ cls: 'ins-red',    icon: '🌙', msg: 'Evening surge detected. Late-day capacity alignment needed.' });
  else if (trafficPattern.label === 'Double Peak')
    items.push({ cls: 'ins-yellow', icon: '⛰️', msg: 'Double-peak pattern — elevated volumes in both morning and afternoon.' });
  else if (trafficPattern.label === 'Midday Spike')
    items.push({ cls: 'ins-yellow', icon: '☀️', msg: 'Midday spike pattern — peak activity mid-day, ensure adequate midday staffing.' });

  // Backlog
  const lastBg = backlog.reduce((v, x, i) => x !== null ? i : v, -1);
  if (lastBg >= 0) {
    const b = backlog[lastBg];
    if (b.status === 'crit')
      items.push({ cls: 'ins-red',    icon: '🚨', msg: 'Backlog CRITICAL — remaining calls significantly exceed available capacity.' });
    else if (b.status === 'risk')
      items.push({ cls: 'ins-yellow', icon: '⚠️', msg: 'Backlog risk — remaining volume approaching staffing capacity.' });
    else
      items.push({ cls: 'ins-green',  icon: '✅', msg: 'Backlog safe — capacity sufficient for remaining projected volume.' });
  }

  return items.slice(0, 7);
}

function renderInsights(items) {
  const el = document.getElementById('operationalInsight');
  el.innerHTML = items.map(it =>
    `<div class="ins-item ${it.cls}"><span class="ins-icon">${it.icon}</span><span>${it.msg}</span></div>`
  ).join('');
}

/* ─────────────────────────────────────────────────────────
   §15  EXECUTIVE NARRATIVE + PERIOD BREAKDOWN
───────────────────────────────────────────────────────── */
function buildNarrative(a) {
  const { periods, spike, dip, overallVariance, status, risk, trafficPattern, blended, dailyForecast } = a;
  if (overallVariance === null) return null;

  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
  const lines = [];

  Object.values(periods).forEach(p => {
    if (p.avg !== null) lines.push(`${p.label.trim()}: ${descDev(p.avg)} (${fmt(p.avg)})`);
  });
  if (spike) lines.push(`Largest spike: ${spike.interval} (${fmt(spike.deviation)})`);
  if (dip)   lines.push(`Largest dip: ${dip.interval} (${fmt(dip.deviation)})`);
  if (overallVariance !== null) lines.push(`Overall avg deviation: ${fmt(overallVariance)}`);

  let interp = '';
  if      (trafficPattern.label === 'Front-Loaded') interp = 'Front-loaded pattern — higher early volumes tapering off through the afternoon.';
  else if (trafficPattern.label === 'Delayed Peak')  interp = 'Delayed peak — traffic building later. Afternoon capacity is critical.';
  else if (trafficPattern.label === 'Double Peak')   interp = 'Double peak — two distinct surge windows. Staffing must cover both.';
  else if (trafficPattern.label === 'Midday Spike')  interp = 'Midday spike pattern — peak activity concentrated mid-day.';
  else if (Math.abs(overallVariance) <= 3)           interp = 'Arrival pattern closely tracking historical norms.';
  else if (overallVariance > 5)                      interp = 'Overall volumes elevated above historical — sustained demand pressure.';
  else if (overallVariance < -5)                     interp = 'Volumes running below historical — softer than expected demand.';
  else                                               interp = 'Minor deviations from historical norms. Continue monitoring.';

  let rec = '';
  switch (status.cls) {
    case 'card-normal':   rec = 'No immediate staffing action required.'; break;
    case 'card-drifting': rec = 'Monitor before adjusting staffing. Consider a soft reforecast.'; break;
    case 'card-major':    rec = 'Initiate intraday reforecast. Staffing alignment review recommended immediately.'; break;
    default:              rec = 'Enter data to generate recommendation.';
  }

  return { lines, interp, rec };
}

function descDev(pct) {
  const a = Math.abs(pct), d = pct > 0 ? 'above' : 'below';
  if (a <= 2)  return 'Tracking at expected levels';
  if (a <= 5)  return `Slightly ${d} historical`;
  if (a <= 10) return `Moderately ${d} historical`;
  return `Significantly ${d} historical`;
}

function renderNarrative(summary) {
  const el = document.getElementById('executiveNarrative');
  if (!summary) { el.innerHTML = '<p class="ph">Load data to generate executive summary.</p>'; return; }
  const lines = summary.lines.map(l =>
    `<div class="n-line"><span class="n-dot"></span><span>${l}</span></div>`
  ).join('');
  el.innerHTML = `${lines}
    <div class="n-section">Interpretation</div>
    <div class="n-line"><span class="n-dot" style="background:var(--purple)"></span><span>${summary.interp}</span></div>
    <div class="n-section">Recommendation</div>
    <div class="n-line"><span class="n-dot" style="background:var(--em)"></span><span>${summary.rec}</span></div>`;
}

function renderPeriods(periods) {
  const el = document.getElementById('periodBreakdown');
  if (!periods) { el.innerHTML = '<p class="ph">Period analysis will appear here.</p>'; return; }
  el.innerHTML = Object.values(periods).map(p => {
    const val = p.avg !== null ? `${p.avg > 0 ? '+' : ''}${p.avg.toFixed(1)}%` : '—';
    const cls = p.avg === null ? 'pv-neutral' : Math.abs(p.avg) <= 5 ? 'pv-green' : Math.abs(p.avg) <= 10 ? 'pv-yellow' : 'pv-red';
    return `<div class="period-row"><span class="period-label">${p.label}</span><span class="period-val ${cls}">${val}</span></div>`;
  }).join('');
}

/* ─────────────────────────────────────────────────────────
   §16  CHARTS
───────────────────────────────────────────────────────── */
const CH = {
  blue:    '#38bdf8', blueA:   'rgba(56,189,248,.12)',
  teal:    '#22d3ee', tealA:   'rgba(34,211,238,.1)',
  green:   '#34d399', greenA:  'rgba(52,211,153,.1)',
  amber:   '#fbbf24', amberA:  'rgba(251,191,36,.1)',
  purple:  '#c084fc', purpleA: 'rgba(192,132,252,.09)',
  orange:  '#fb923c', orangeA: 'rgba(251,146,60,.09)',
  grid:    'rgba(255,255,255,.04)',
  axis:    'rgba(255,255,255,.07)',
  text:    '#4b5a72',
};

let cForecast = null, cArrival = null, cDeviation = null;

function initCharts() {
  Chart.defaults.color = CH.text;
  Chart.defaults.font.family = "'Space Grotesk', sans-serif";
  Chart.defaults.font.size = 11;

  cForecast = new Chart(document.getElementById('forecastChart'), {
    type: 'line',
    data: { labels: INTERVALS, datasets: [
      { label: 'Today Actual',    data: new Array(N).fill(null), borderColor: CH.purple,  backgroundColor: CH.purpleA, borderWidth: 2.5, pointRadius: 1.5, tension: .35, fill: true },
      { label: 'Hist. Avg',       data: new Array(N).fill(null), borderColor: CH.blue,    backgroundColor: CH.blueA,   borderWidth: 2,   pointRadius: 1.5, tension: .35, fill: false, borderDash: [4,3] },
      { label: 'Run-Rate',        data: new Array(N).fill(null), borderColor: CH.amber,   backgroundColor: CH.amberA,  borderWidth: 2,   pointRadius: 1.5, tension: .4,  fill: false, borderDash: [6,3] },
      { label: 'Reforecast',      data: new Array(N).fill(null), borderColor: CH.orange,  backgroundColor: CH.orangeA, borderWidth: 2,   pointRadius: 1.5, tension: .4,  fill: false, borderDash: [3,3] },
      { label: 'Blended Fcst',    data: new Array(N).fill(null), borderColor: CH.green,   backgroundColor: CH.greenA,  borderWidth: 2.5, pointRadius: 1.5, tension: .4,  fill: false },
    ]},
    options: lineOpts(false),
  });

  cArrival = new Chart(document.getElementById('arrivalChart'), {
    type: 'line',
    data: { labels: INTERVALS, datasets: [
      { label: 'Arrival %', data: new Array(N).fill(null), borderColor: CH.teal, backgroundColor: CH.tealA, borderWidth: 2, pointRadius: 1.5, tension: .4, fill: true },
    ]},
    options: lineOpts(true),
  });

  cDeviation = new Chart(document.getElementById('deviationChart'), {
    type: 'bar',
    data: { labels: INTERVALS, datasets: [
      { label: 'Deviation %', data: new Array(N).fill(null),
        backgroundColor: new Array(N).fill('rgba(56,189,248,.35)'),
        borderColor: new Array(N).fill(CH.blue), borderWidth: 1, borderRadius: 3 },
    ]},
    options: barOpts(),
  });
}

function updateCharts(histAvgs, arrivalPct, devs, runRate, reforecast, blended) {
  cForecast.data.datasets[0].data = state.rows.map(r => r.today);
  cForecast.data.datasets[1].data = histAvgs.map(v  => v !== null ? +v.toFixed(1) : null);
  cForecast.data.datasets[2].data = runRate.map(v   => v !== null ? +v.toFixed(0) : null);
  cForecast.data.datasets[3].data = reforecast.map(v => v !== null ? +v.toFixed(0) : null);
  cForecast.data.datasets[4].data = blended.map(v   => v !== null ? +v.toFixed(0) : null);
  cForecast.update('none');

  cArrival.data.datasets[0].data = arrivalPct.map(v => v !== null ? +(v * 100).toFixed(2) : null);
  cArrival.update('none');

  const dd = devs.map(d => d !== null ? +d.toFixed(2) : null);
  cDeviation.data.datasets[0].data = dd;
  cDeviation.data.datasets[0].backgroundColor = dd.map(d => {
    if (d === null) return 'rgba(148,163,184,.15)';
    const a = Math.abs(d);
    if (a <= 5)  return d > 0 ? 'rgba(251,113,133,.35)' : 'rgba(52,211,153,.35)';
    if (a <= 10) return 'rgba(251,191,36,.4)';
    return 'rgba(251,113,133,.55)';
  });
  cDeviation.data.datasets[0].borderColor = dd.map(d => {
    if (d === null) return '#4b5a72';
    const a = Math.abs(d);
    if (a <= 5)  return d > 0 ? '#fb7185' : '#34d399';
    if (a <= 10) return '#fbbf24';
    return '#fb7185';
  });
  cDeviation.update('none');
}

function lineOpts(compact = false) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 10, padding: 12, color: '#6b7a96', font: { size: 10.5 } } },
      tooltip: chartTooltip(),
    },
    scales: {
      x: { ticks: { color: CH.text, maxRotation: 45, autoSkip: true, maxTicksLimit: compact ? 8 : 10, font: { size: 9 } }, grid: { color: CH.grid }, border: { color: CH.axis } },
      y: { ticks: { color: CH.text, font: { size: 10 } }, grid: { color: CH.grid }, border: { color: CH.axis } },
    },
    animation: { duration: 0 },
  };
}
function barOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: chartTooltip() },
    scales: {
      x: { ticks: { color: CH.text, maxRotation: 45, autoSkip: true, maxTicksLimit: 10, font: { size: 9 } }, grid: { color: CH.grid }, border: { color: CH.axis } },
      y: { title: { display: true, text: 'Deviation %', color: CH.text, font: { size: 10 } }, ticks: { color: CH.text, font: { size: 10 } }, grid: { color: CH.grid }, border: { color: CH.axis } },
    },
    animation: { duration: 0 },
  };
}
function chartTooltip() {
  return { backgroundColor: '#0d1120', borderColor: 'rgba(56,189,248,.25)', borderWidth: 1, titleColor: '#f0f4ff', bodyColor: '#6b7a96', padding: 10, cornerRadius: 8 };
}

/* ─────────────────────────────────────────────────────────
   §17  TOOLTIP SYSTEM
───────────────────────────────────────────────────────── */
function initTooltips() {
  const tip = document.getElementById('globalTooltip');
  if (!tip) return;
  let hideTimer = null;

  function showTip(el, e) {
    const text = el.dataset.tip || el.closest('[data-tip]')?.dataset.tip;
    if (!text) return;
    clearTimeout(hideTimer);
    tip.textContent = text;
    tip.classList.add('tt-show');
    positionTip(e || el);
  }
  function hideTip() {
    hideTimer = setTimeout(() => tip.classList.remove('tt-show'), 120);
  }
  function positionTip(e) {
    const PAD = 14;
    const tw = tip.offsetWidth || 272;
    const th = tip.offsetHeight || 80;
    let x, y;
    if (e && e.clientX !== undefined) { x = e.clientX + PAD; y = e.clientY - th / 2; }
    else {
      const rect = e.getBoundingClientRect ? e.getBoundingClientRect() : { right: 120, top: 120, width: 0, height: 0 };
      x = rect.right + PAD; y = rect.top - th / 2 + rect.height / 2;
    }
    x = Math.min(x, window.innerWidth  - tw  - 8);
    y = Math.max(8, Math.min(y, window.innerHeight - th - 8));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el) showTip(el, e); else hideTip();
  });
  document.addEventListener('mousemove', e => {
    if (tip.classList.contains('tt-show')) positionTip(e);
  });
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget?.closest('[data-tip]')) hideTip();
  });
  document.addEventListener('touchstart', e => {
    const el = e.target.closest('[data-tip]');
    if (el) { showTip(el); setTimeout(hideTip, 2800); } else hideTip();
  }, { passive: true });
}

/* ─────────────────────────────────────────────────────────
   §23  DATA SOURCE MODE  (Manual / Auto + CSV Upload)
───────────────────────────────────────────────────────── */
function initDataSourceMode() {
  const radios = document.querySelectorAll('input[name="dataMode"]');
  const manualSection = document.getElementById('manualSection');
  const autoSection   = document.getElementById('autoSection');

  function applyMode(mode) {
    state.dataMode = mode;
    if (mode === 'manual') {
      manualSection.style.display = '';
      autoSection.style.display   = 'none';
    } else {
      manualSection.style.display = 'none';
      autoSection.style.display   = '';
    }
  }

  radios.forEach(r => {
    r.addEventListener('change', () => applyMode(r.value));
  });
  applyMode('manual'); // default

  // CSV Upload handler
  const csvInput = document.getElementById('csvUpload');
  if (csvInput) {
    csvInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const result = parseCSV(ev.target.result);
        if (result.error) { showToast('CSV Error: ' + result.error); return; }
        applyCSVData(result);
        showToast(`CSV loaded: ${result.rows} rows applied`);
        csvInput.value = '';
      };
      reader.readAsText(file);
    });
  }
}

/* Parse CSV for interval data.
 * Supported column headers (case-insensitive):
 *   interval | time, wk1|week1, wk2|week2, wk3, wk4, wk5, today|actual
 * Returns { data: [{interval,days,today}], rows: n } or { error }
 */
function parseCSV(raw) {
  const lines = raw.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: 'File is empty or has no data rows' };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
  const colMap = {};

  headers.forEach((h, idx) => {
    if (/^(interval|time|slot)/.test(h)) colMap.interval = idx;
    else if (/^(today|actual|todayactual)/.test(h)) colMap.today = idx;
    else {
      const m = h.match(/^(wk|week|w)(\d+)$/);
      if (m) colMap[`w${Math.max(0, parseInt(m[2], 10) - 1)}`] = idx;
    }
  });

  const data = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(',').map(c => c.trim());
    const entry = { days: state.weeksData.map(() => null), today: null };
    for (let d = 0; d < state.weeksData.length; d++) {
      const k = `w${d}`;
      if (colMap[k] !== undefined) {
        const v = parseFloat(cols[colMap[k]]);
        entry.days[d] = isNaN(v) ? null : v;
      }
    }
    if (colMap.today !== undefined) {
      const v = parseFloat(cols[colMap.today]);
      entry.today = isNaN(v) ? null : v;
    }
    data.push(entry);
  }

  return { data, rows: data.length };
}

function applyCSVData(result) {
  result.data.forEach((entry, i) => {
    if (i >= N) return;
    entry.days.forEach((v, d) => {
      state.rows[i].days[d] = v;
      const inp = document.getElementById(`w${d}-${i}`);
      if (inp) inp.value = v !== null ? v : '';
    });
    state.rows[i].today = entry.today;
    const inp = document.getElementById(`t-${i}`);
    if (inp) inp.value = entry.today !== null ? entry.today : '';
  });
  syncWeeksDataFromRows();
  scheduleRecalc();
}

/* ─────────────────────────────────────────────────────────
   §19  EXPORT
───────────────────────────────────────────────────────── */
function buildExportText(a) {
  if (!a) return 'No analysis data. Please enter data first.';
  const fmt  = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
  const fmtI = v => v !== null ? Math.round(v).toLocaleString() : 'N/A';
  const now  = new Date().toLocaleString();
  let t = `INTRADAY INTELLIGENCE DASHBOARD v4\nGenerated: ${now}\n${'─'.repeat(52)}\n\n`;
  t += `PATTERN STATUS:    ${a.status.label}\n`;
  t += `AVG DEVIATION:     ${fmt(a.overallVariance)}\n`;
  t += `SERVICE RISK:      ${a.risk.label}\n`;
  t += `TRAFFIC PATTERN:   ${a.trafficPattern.label}\n`;
  t += `SPIKE STATUS:      ${a.spikeSummary.severity || 'Clear'}\n`;

  let latBl = null; for (let i = N - 1; i >= 0; i--) { if (a.blended[i] !== null) { latBl = a.blended[i]; break; } }
  let latRR = null; for (let i = N - 1; i >= 0; i--) { if (a.runRate[i] !== null) { latRR = a.runRate[i]; break; } }
  let latRF = null; for (let i = N - 1; i >= 0; i--) { if (a.reforecast[i] !== null) { latRF = a.reforecast[i]; break; } }

  if (a.dailyForecast) t += `DAILY FORECAST:    ${fmtI(a.dailyForecast)}\n`;
  t += `HIST. PROJECTION:  ${fmtI(a.dailyForecast)}\n`;
  t += `RUN-RATE PROJ.:    ${fmtI(latRR)}\n`;
  t += `REFORECAST EOD:    ${fmtI(latRF)}\n`;
  t += `BLENDED FORECAST:  ${fmtI(latBl)}\n`;
  if (a.accuracy) t += `FORECAST ACCURACY: ${a.accuracy.accuracy.toFixed(1)}% (${a.accuracy.label})\n`;
  if (a.variability) t += `FORECAST RELIAB.:  ${a.variability.label} (${a.variability.pct.toFixed(1)}% variability)\n`;

  t += `\nPERIOD SUMMARY\n${'─'.repeat(32)}\n`;
  Object.values(a.periods).forEach(p => { t += `${p.label.trim()}: ${fmt(p.avg)}\n`; });
  if (a.spike) t += `\nLargest Spike:  ${a.spike.interval} (${fmt(a.spike.deviation)})\n`;
  if (a.dip)   t += `Largest Dip:    ${a.dip.interval} (${fmt(a.dip.deviation)})\n`;

  if (a.narrative) {
    t += `\nNARRATIVE\n${'─'.repeat(32)}\n`;
    a.narrative.lines.forEach(l => { t += `• ${l}\n`; });
    t += `\nInterpretation:\n${a.narrative.interp}\n\nRecommendation:\n${a.narrative.rec}\n`;
  }
  t += `\n${'─'.repeat(52)}\nIntraday Intelligence Dashboard v4 | Workforce Intelligence Suite\nBuilt by Abdul Basit\n`;
  return t;
}

function updateExportPreview(a) {
  document.getElementById('exportPreview').textContent = buildExportText(a);
}

/* ─────────────────────────────────────────────────────────
   §18  MAIN RECALCULATION PIPELINE  (debounced 60ms)
───────────────────────────────────────────────────────── */
let _rt = null;
function scheduleRecalc() { clearTimeout(_rt); _rt = setTimeout(runRecalc, 60); }

function runRecalc() {
  const histAvgs       = calcHistAvg();
  const arrivalPct     = calcArrivalPattern(histAvgs);
  const histCompletion = calcHistCompletion(histAvgs);
  const devs           = calcDeviation(histAvgs);
  const cumActual      = calcCumActual();
  const cumHist        = calcCumHist(histAvgs);
  const dailyForecast  = state.dailyForecast;
  const availCap       = state.availableCapacity;

  const histProj   = calcHistProj(arrivalPct, dailyForecast);
  const runRate    = calcRunRate(cumActual, histCompletion);
  const reforecast = calcReforecast(cumActual, histCompletion, dailyForecast); // §24
  const blended    = calcBlended(runRate, histCompletion, dailyForecast);
  const remaining  = calcRemaining(blended, cumActual);
  const confidence = calcConfidence(devs, histCompletion, blended, dailyForecast);
  const backlog    = calcBacklog(remaining, histCompletion, availCap);

  const spikeArr     = calcSpikeStatus(histAvgs);      // §20
  const spikeSummary = summariseSpike(spikeArr);        // §20
  const accuracy     = calcForecastAccuracy(blended);   // §13
  const variability  = calcVariabilityIndex(histAvgs);  // §21

  const overallVariance = calcOverallVariance(devs);
  const spike           = findSpike(devs);
  const dip             = findDip(devs);
  const periods         = calcPeriods(devs);
  const status          = detectStatus(overallVariance);
  const risk            = detectRisk(overallVariance);
  const trafficPattern  = detectPattern(periods);       // §22
  const narrative       = buildNarrative({ periods, spike, dip, overallVariance, status, risk, trafficPattern, blended, dailyForecast });

  const analysis = {
    histAvgs, arrivalPct, histCompletion, devs, cumActual, cumHist,
    histProj, runRate, reforecast, blended, remaining, confidence, backlog,
    spikeArr, spikeSummary, accuracy, variability,
    overallVariance, spike, dip, periods, status, risk, trafficPattern, narrative,
    dailyForecast, availCap,
  };
  state.analysis = analysis;

  updateCells(histAvgs, arrivalPct, histCompletion, devs, histProj, runRate, reforecast, blended, confidence, remaining, backlog, spikeArr);
  updateKPIs(analysis);
  renderInsights(buildInsights(analysis));
  renderNarrative(narrative);
  renderPeriods(periods);
  updateCharts(histAvgs, arrivalPct, devs, runRate, reforecast, blended);
  updateExportPreview(analysis);
  // v5 extensions
  if (typeof renderDecisionEngine === 'function') renderDecisionEngine(analysis);
  if (typeof renderRiskMeter === 'function') renderRiskMeter(analysis);
  if (typeof renderMistakeDetector === 'function') renderMistakeDetector(analysis);
}

/* ─────────────────────────────────────────────────────────
   BULK PASTE
───────────────────────────────────────────────────────── */
function applyColumnPaste(colIndex, rawText) {
  const vals = rawText.split('\n')
    .map(l => l.trim()).filter(l => l !== '')
    .map(l => parseFloat(l.replace(/,/g, '')));

  let applied = 0;
  for (let i = 0; i < N && i < vals.length; i++) {
    const v = vals[i];
    if (isNaN(v)) continue;
    if (colIndex === 'today') {
      state.rows[i].today = v;
      const inp = document.getElementById(`t-${i}`);
      if (inp) inp.value = v;
    } else {
      const d = parseInt(colIndex);
      state.rows[i].days[d] = v;
      const inp = document.getElementById(`w${d}-${i}`);
      if (inp) inp.value = v;
    }
    applied++;
  }
  syncWeeksDataFromRows();
  scheduleRecalc();
  return applied;
}

/* EXCEL Ctrl+V PASTE */
function handleTablePaste(e) {
  const text = e.clipboardData.getData('text/plain');
  if (!text.includes('\t')) return;
  e.preventDefault();

  const lines  = text.trim().split('\n');
  const matrix = lines.map(l => l.split('\t').map(c => c.trim()));

  const active = document.activeElement;
  let startRow = 0, startCol = 0;
  if (active && active.id) {
    const mRow = active.id.match(/-(\d+)$/);
    if (mRow) startRow = parseInt(mRow[1]);
    if (active.id.startsWith('t-')) startCol = 'today';
    else {
      const mCol = active.id.match(/^w(\d+)-/);
      if (mCol) startCol = parseInt(mCol[1]);
    }
  }

  let applied = 0;
  matrix.forEach((row, ri) => {
    const rowIdx = startRow + ri;
    if (rowIdx >= N) return;
    row.forEach((cell, ci) => {
      const v = parseFloat(cell.replace(/,/g, ''));
      if (isNaN(v)) return;
      if (startCol === 'today') {
        state.rows[rowIdx].today = v;
        const inp = document.getElementById(`t-${rowIdx}`);
        if (inp) inp.value = v;
        applied++;
      } else {
        const colD = (typeof startCol === 'number' ? startCol : 0) + ci;
        if (colD < state.weeksData.length) {
          state.rows[rowIdx].days[colD] = v;
          const inp = document.getElementById(`w${colD}-${rowIdx}`);
          if (inp) inp.value = v;
          applied++;
        } else if (colD === state.weeksData.length) {
          state.rows[rowIdx].today = v;
          const inp = document.getElementById(`t-${rowIdx}`);
          if (inp) inp.value = v;
          applied++;
        }
      }
    });
  });

  if (applied > 0) { syncWeeksDataFromRows(); renderWeeks(); scheduleRecalc(); showToast(`Pasted ${applied} values`); }
}

/* ─────────────────────────────────────────────────────────
   EXAMPLE DATA
───────────────────────────────────────────────────────── */
function loadExample() {
  const base = [
    18,24,30,38,52,65,78,88,96,102,108,114,
    118,122,125,122,112,105,98,92,88,85,82,80,
    84,89,94,98,102,104,106,102,94,84,72,60,
    48,36,26,18,14,12,11,10,9,9,8,8,
    7,7,6,6,5,5,4,4,3,3,3,2,2,
  ];
  const todayShift = [
    -.12,-.10,-.09,-.08,-.07,-.06,-.05,-.04,
    -.02,-.01,.08,.15,.22,.18,.12,.08,
    -.02,-.03,-.02,-.01,.01,.02,.03,.04,
    .05,.07,.09,.10,.11,.12,.10,.09,
    .08,.07,.06,.05,.04,.03,.02,.01,
    .01,.00,-.01,-.01,.00,.00,.00,.00,
    .00,.00,.00,.00,.00,.00,.00,.00,
    .00,.00,.00,.00,.00,
  ];
  const rng = s => { const x = Math.sin(s) * 10000; return .93 + (x - Math.floor(x)) * .14; };

  INTERVALS.forEach((_, i) => {
    const b = base[i] || 2;
    for (let d = 0; d < state.weeksData.length; d++) {
      const v = Math.max(0, Math.round(b * rng(i * 7 + d * 13 + 42)));
      state.rows[i].days[d] = v;
      const inp = document.getElementById(`w${d}-${i}`);
      if (inp) inp.value = v;
    }
    const tv = Math.max(0, Math.round(b * (1 + (todayShift[i] || 0))));
    state.rows[i].today = tv;
    const inp = document.getElementById(`t-${i}`);
    if (inp) inp.value = tv;
  });

  document.getElementById('dailyForecastInput').value = 2500;
  state.dailyForecast = 2500;
  document.getElementById('availableCapacityInput').value = 2400;
  state.availableCapacity = 2400;

  syncWeeksDataFromRows();
  renderWeeks();
  scheduleRecalc();
  showToast('Example loaded — spike severity + reforecast demo active');
}

function clearAll() {
  state.rows.forEach((_, i) => {
    state.rows[i] = { days: state.weeksData.map(() => null), today: null };
    for (let d = 0; d < state.weeksData.length; d++) {
      const inp = document.getElementById(`w${d}-${i}`); if (inp) inp.value = '';
    }
    const inp = document.getElementById(`t-${i}`); if (inp) inp.value = '';
  });
  document.querySelectorAll('.paste-ta').forEach(el => { el.value = ''; });
  document.getElementById('dailyForecastInput').value = '';
  document.getElementById('availableCapacityInput').value = '';
  state.dailyForecast = null; state.availableCapacity = null; state.analysis = null;
  syncWeeksDataFromRows();
  renderWeeks();
  scheduleRecalc();
  showToast('All data cleared');
}


function initWeekControls() {
  const addBtn = document.getElementById('addWeek');
  const removeBtn = document.getElementById('removeWeek');
  if (!addBtn || !removeBtn) return;

  function rerenderWeekUI(scrollToEnd = false) {
    const prevRows = state.rows.map(r => ({ days: [...r.days], today: r.today }));
    restoreRowsFromWeeksData(prevRows);
    renderWeeks();
    buildTable();
    scheduleRecalc();
    if (scrollToEnd) {
      const grid = document.getElementById('pasteGrid');
      if (grid) grid.scrollTo({ left: grid.scrollWidth, behavior: 'smooth' });
    }
  }

  addBtn.addEventListener('click', () => {
    const idx = state.weeksData.length + 1;
    state.weeksData.push({ label: `WK -${idx}`, values: state.rows.map(() => null) });
    rerenderWeekUI(true);
  });

  removeBtn.addEventListener('click', () => {
    if (state.weeksData.length <= 1) {
      showToast('At least one historical week is required');
      return;
    }
    state.weeksData.pop();
    state.rows.forEach(r => { r.days = r.days.slice(0, state.weeksData.length); });
    rerenderWeekUI();
  });
}

function generateWFMInsight(data) {
  if (!data) return 'Add intraday data first, then I can provide WFM guidance.';
  if (data.variancePct > 10) return 'Volume spike detected. Recommend immediate OT or cross-skill allocation.';
  if (data.variancePct < -10) return 'Overstaffing risk. Consider shrinkage pullback or VTO.';
  if (data.backlogRisk === 'Critical' || data.backlogRisk === 'Risk') return 'Service level likely to drop. Trigger reforecast and staffing adjustment.';
  return `Traffic is ${data.trafficPattern || 'stable'} with variance ${data.variancePct?.toFixed(1) ?? 'N/A'}%. Continue monitoring and keep staffing aligned.`;
}

function initCopilot() {
  const panel = document.getElementById('copilotPanel');
  const toggle = document.getElementById('copilotToggle');
  const collapse = document.getElementById('copilotCollapse');
  const sendBtn = document.getElementById('copilotSend');
  const input = document.getElementById('copilotInput');
  const messages = document.getElementById('copilotMessages');
  if (!panel || !toggle || !sendBtn || !input || !messages) return;

  const appendMsg = (text, who) => {
    const m = document.createElement('div');
    m.className = `copilot-msg copilot-msg--${who}`;
    m.textContent = text;
    messages.appendChild(m);
    messages.scrollTop = messages.scrollHeight;
  };

  const send = () => {
    const q = input.value.trim();
    if (!q) return;
    appendMsg(q, 'user');
    input.value = '';

    const a = state.analysis;
    const latestBacklog = a?.backlog?.reduce((v, x) => x ? x.label : v, null);
    const latestProjection = a?.blended?.reduce((v, x) => x !== null ? x : v, null);
    const latestRf = a?.reforecast?.reduce((v, x) => x !== null ? x : v, null);
    const data = {
      trafficPattern: a?.trafficPattern?.label,
      cumulativeToday: a?.cumActual?.reduce((v, x) => x !== null ? x : v, null),
      expectedByNow: a?.cumHist?.reduce((v, x) => x !== null ? x : v, null),
      variancePct: a?.overallVariance ?? 0,
      projection: latestProjection,
      reforecastEOD: latestRf,
      backlogRisk: latestBacklog,
    };
    appendMsg(generateWFMInsight(data), 'ai');
  };

  const setOpen = open => {
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  if (collapse) collapse.addEventListener('click', () => setOpen(false));
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  appendMsg('Hi, I am your WFM Co-Pilot. Ask about risk, staffing, or variance spikes.', 'ai');
}

/* ─────────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────────── */
function showToast(msg) {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id = '_toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('toast--on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('toast--on'), 2800);
}

/* ─────────────────────────────────────────────────────────
   EXPORT HELPERS
───────────────────────────────────────────────────────── */
function exportOutlook() {
  const b = buildExportText(state.analysis);
  window.location.href = `mailto:?subject=${encodeURIComponent('Intraday Intelligence Report')}&body=${encodeURIComponent(b)}`;
}
function exportGmail() {
  const b = buildExportText(state.analysis);
  window.open(`https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Intraday Intelligence Report')}&body=${encodeURIComponent(b)}`, '_blank');
}
async function copySummary() {
  const t = buildExportText(state.analysis);
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
  showToast('Summary copied to clipboard');
}
function downloadReport() {
  const t = buildExportText(state.analysis);
  const blob = new Blob([t], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `intraday-analysis-${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Report downloaded');
}

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  restoreRowsFromWeeksData();
  renderWeeks();
  buildTable();
  initCharts();
  initTooltips();
  initDataSourceMode(); // §23
  initWeekControls();
  initCopilot();
  runRecalc();

  document.getElementById('loadExampleBtn').addEventListener('click', loadExample);
  document.getElementById('clearDataBtn').addEventListener('click', clearAll);

  document.getElementById('pasteGrid').addEventListener('click', e => {
    const btn = e.target.closest('.btn--apply');
    if (!btn) return;
    const col = btn.dataset.col;
    const taId = col === 'today' ? 'pasteToday' : `pasteW${parseInt(col, 10) + 1}`;
    const ta = document.getElementById(taId);
    if (!ta || !ta.value.trim()) { showToast('Nothing to paste'); return; }
    const n = applyColumnPaste(col === 'today' ? 'today' : col, ta.value);
    if (col !== 'today') state.weeksData[parseInt(col, 10)].values = ta.value.split('\n').map(v => parseFloat(v)).map(v => (Number.isFinite(v) ? v : null));
    showToast(`Applied ${n} values to ${col === 'today' ? 'Today Actual' : 'Week −' + (parseInt(col, 10) + 1)}`);
  });

  document.getElementById('tableWrapper').addEventListener('paste', handleTablePaste);
  document.getElementById('dataTable').addEventListener('paste', handleTablePaste);

  document.getElementById('dailyForecastInput').addEventListener('input', e => {
    state.dailyForecast = parseFloat(e.target.value) || null; scheduleRecalc();
  });
  document.getElementById('availableCapacityInput').addEventListener('input', e => {
    state.availableCapacity = parseFloat(e.target.value) || null; scheduleRecalc();
  });

  // §23 Auto-mode config inputs sync to state
  const dfAuto  = document.getElementById('dailyForecastInputAuto');
  const capAuto = document.getElementById('availableCapacityInputAuto');
  if (dfAuto)  dfAuto.addEventListener('input',  e => { state.dailyForecast     = parseFloat(e.target.value) || null; scheduleRecalc(); });
  if (capAuto) capAuto.addEventListener('input', e => { state.availableCapacity = parseFloat(e.target.value) || null; scheduleRecalc(); });

  document.getElementById('outlookBtn').addEventListener('click', exportOutlook);
  document.getElementById('gmailBtn').addEventListener('click',   exportGmail);
  document.getElementById('copyBtn').addEventListener('click',    copySummary);
  document.getElementById('downloadBtn').addEventListener('click', downloadReport);

  const toggle = document.getElementById('menuToggle');
  const nav    = document.querySelector('.nav-links');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
  }
});

/* ═══════════════════════════════════════════════════════════════
   v5 ENHANCEMENTS
   §25  Decision Engine
   §26  Risk Meter
   §27  What-If Simulator
   §28  Mistake Detector
   §29  Enhanced Co-Pilot (uses Anthropic API)
   §30  About Section Interactions
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   §25  DECISION ENGINE
───────────────────────────────────────────────────────── */
function buildDecisionCards(a) {
  if (!a || a.overallVariance === null) return null;

  const cards = [];
  const ov = a.overallVariance;
  const latestBacklog = a.backlog.reduce((v, x) => x ? x : v, null);
  const staffingGap = a.availCap ? (a.availCap * (1 - (a.histCompletion.reduce((v, x) => x !== null ? x : v, 0)))) - (a.remaining.reduce((v, x) => x !== null ? x : v, 0)) : null;
  const ahtVariance = ov; // proxy — actual AHT variance needs AHT inputs; we use deviation as signal

  // High demand + understaffing
  if (ov > 5 && (latestBacklog?.status === 'crit' || latestBacklog?.status === 'risk')) {
    cards.push({
      badge: '🚨 HIGH DEMAND · UNDERSTAFFED', badgeCls: 'red',
      title: 'Compounding Workload Risk',
      actions: ['Pull agents from offline activities immediately', 'Offer voluntary overtime to available agents', 'Reallocate agents from low-volume queues', 'Escalate to operations manager now'],
    });
  }
  // Volume up only
  else if (ov > 5 && latestBacklog?.status === 'safe') {
    cards.push({
      badge: '⚠️ VOLUME SPIKE', badgeCls: 'yellow',
      title: 'Demand-Driven Pressure',
      actions: ['Monitor for next 2–3 intervals before action', 'Pre-position agents to high-volume queues', 'Begin soft reforecast to update EOD projection', 'Alert team leads to reduce AUX time'],
    });
  }
  // Overstaffed
  if (ov < -5) {
    cards.push({
      badge: '📉 OVERSTAFFED', badgeCls: 'blue',
      title: 'Volume Running Below Forecast',
      actions: ['Offer voluntary time off (VTO) to willing agents', 'Move available agents to backlog or admin tasks', 'Schedule offline coaching or training', 'Review tomorrow\'s forecast for potential over-planning'],
    });
  }
  // AHT issue (using spike as proxy signal)
  if (a.spikeSummary?.level !== 'none' && Math.abs(ov) < 5) {
    cards.push({
      badge: '🔍 EFFICIENCY SIGNAL', badgeCls: 'yellow',
      title: 'Process Inefficiency Detected',
      actions: ['Review call recordings in affected intervals', 'Investigate system slowdowns or escalation queues', 'Escalate to QA / Operations for AHT analysis', 'Check if training or supervisor support is needed'],
    });
  }
  // Normal
  if (cards.length === 0 && Math.abs(ov) <= 5) {
    cards.push({
      badge: '✅ ON TRACK', badgeCls: 'green',
      title: 'Operations Running Normally',
      actions: ['No immediate staffing action required', 'Continue monitoring every 15–30 minutes', 'Verify afternoon staffing alignment', 'Communicate green status to team leads'],
    });
  }
  // Pattern-specific
  if (a.trafficPattern?.label === 'Double Peak') {
    cards.push({
      badge: '⛰️ PATTERN ALERT', badgeCls: 'yellow',
      title: 'Double Peak Pattern — Afternoon Surge Incoming',
      actions: ['Ensure afternoon agents are in seat by 13:30', 'Avoid scheduling breaks during peak windows', 'Pre-alert team leads for second surge', 'Review OT availability for early afternoon'],
    });
  }
  if (a.trafficPattern?.label === 'Evening Surge') {
    cards.push({
      badge: '🌙 EVENING SURGE', badgeCls: 'red',
      title: 'Evening Volume Surge Detected',
      actions: ['Check evening staffing coverage now', 'Offer OT to agents who want extra hours', 'Coordinate late-shift handover with incoming team', 'Reforecast EOD using current run-rate'],
    });
  }

  return cards;
}

function renderDecisionEngine(a) {
  const el = document.getElementById('decisionEngine');
  if (!el) return;
  const cards = buildDecisionCards(a);
  if (!cards || cards.length === 0) {
    el.innerHTML = '<div class="decision-empty"><span class="decision-empty-icon">🎯</span><p>Enter intraday data to unlock recommended actions</p></div>';
    return;
  }
  el.innerHTML = cards.map(c => `
    <div class="decision-card decision-card--${c.badgeCls}">
      <div class="decision-badge decision-badge--${c.badgeCls}">${c.badge}</div>
      <div class="decision-title">${c.title}</div>
      <ul class="decision-actions">${c.actions.map(a => `<li>${a}</li>`).join('')}</ul>
    </div>
  `).join('');
}

/* ─────────────────────────────────────────────────────────
   §26  RISK METER
───────────────────────────────────────────────────────── */
function calcRiskScore(a) {
  if (!a || a.overallVariance === null) return null;
  const ov = Math.abs(a.overallVariance);
  const spike = a.spikeSummary?.level;
  const backlogStatus = a.backlog.reduce((v, x) => x ? x.status : v, 'safe');
  const confLevel = a.confidence.reduce((v, x) => x ? x.level : v, null);

  let score = 0;
  // Volume variance (0–40)
  if (ov > 15) score += 40;
  else if (ov > 10) score += 30;
  else if (ov > 5) score += 18;
  else score += 5;

  // Spike (0–25)
  if (spike === 'critical') score += 25;
  else if (spike === 'major') score += 17;
  else if (spike === 'mild') score += 8;

  // Backlog (0–25)
  if (backlogStatus === 'crit') score += 25;
  else if (backlogStatus === 'risk') score += 14;
  else score += 2;

  // Confidence penalty (0–10)
  if (confLevel === 'low') score += 10;
  else if (confLevel === 'med') score += 4;

  return Math.min(100, score);
}

function renderRiskMeter(a) {
  const scoreEl = document.getElementById('riskScoreValue');
  const labelEl = document.getElementById('riskScoreLabel');
  const factorsEl = document.getElementById('riskFactors');
  const needle = document.getElementById('riskNeedle');
  const arc = document.getElementById('riskArc');
  if (!scoreEl) return;

  const score = calcRiskScore(a);
  if (score === null) {
    scoreEl.textContent = '—';
    if (labelEl) labelEl.textContent = 'Awaiting data';
    return;
  }

  let level, color, label;
  if (score >= 60) { level = 'HIGH'; color = 'var(--rose)'; label = 'High Risk — Action Required'; }
  else if (score >= 35) { level = 'MED'; color = 'var(--am)'; label = 'Moderate Risk — Monitor Closely'; }
  else { level = 'LOW'; color = 'var(--em)'; label = 'Low Risk — Operations Stable'; }

  scoreEl.textContent = score;
  scoreEl.style.color = color;
  if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }

  // Needle rotation: -90° (low) to +90° (high)
  const angle = -90 + (score / 100) * 180;
  if (needle) {
    needle.setAttribute('transform', `rotate(${angle}, 150, 145)`);
  }
  // Arc
  if (arc) {
    arc.setAttribute('stroke', color);
    // Draw arc from start to score position
    const rad = (score / 100) * Math.PI;
    const cx = 150, cy = 145, r = 120;
    const startAngle = Math.PI;
    const endAngle = startAngle + rad;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = rad > Math.PI ? 1 : 0;
    arc.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`);
  }

  // Risk factors
  if (factorsEl && a) {
    const ov = Math.abs(a.overallVariance || 0);
    const spikeLvl = a.spikeSummary?.level || 'none';
    const backlogStatus = a.backlog.reduce((v, x) => x ? x.status : v, 'safe');
    const conf = a.confidence.reduce((v, x) => x ? x.level : v, 'high');

    const factors = [
      { name: 'Volume Variance', pct: Math.min(100, ov * 5), val: `${ov.toFixed(1)}%`,
        cls: ov > 10 ? 'red' : ov > 5 ? 'yellow' : 'green' },
      { name: 'Spike Severity', pct: spikeLvl === 'critical' ? 100 : spikeLvl === 'major' ? 70 : spikeLvl === 'mild' ? 35 : 5,
        val: spikeLvl === 'none' ? 'None' : spikeLvl.charAt(0).toUpperCase() + spikeLvl.slice(1),
        cls: spikeLvl === 'critical' ? 'red' : spikeLvl === 'major' ? 'yellow' : spikeLvl === 'mild' ? 'yellow' : 'green' },
      { name: 'Backlog Risk', pct: backlogStatus === 'crit' ? 100 : backlogStatus === 'risk' ? 55 : 10,
        val: backlogStatus === 'crit' ? 'Critical' : backlogStatus === 'risk' ? 'Risk' : 'Safe',
        cls: backlogStatus === 'crit' ? 'red' : backlogStatus === 'risk' ? 'yellow' : 'green' },
      { name: 'Forecast Confidence', pct: conf === 'high' ? 15 : conf === 'med' ? 50 : 90,
        val: conf ? conf.charAt(0).toUpperCase() + conf.slice(1) : '—',
        cls: conf === 'high' ? 'green' : conf === 'med' ? 'yellow' : 'red' },
    ];

    factorsEl.innerHTML = factors.map(f => `
      <div class="risk-factor">
        <span class="risk-factor-name">${f.name}</span>
        <div class="risk-factor-bar-wrap"><div class="risk-factor-bar risk-factor-bar--${f.cls}" style="width:${f.pct}%"></div></div>
        <span class="risk-factor-val" style="color:var(--${f.cls === 'red' ? 'rose' : f.cls === 'yellow' ? 'am' : 'em'})">${f.val}</span>
      </div>
    `).join('');
  }
}

/* ─────────────────────────────────────────────────────────
   §27  WHAT-IF SIMULATOR
───────────────────────────────────────────────────────── */
function initSimulator() {
  const volSlider = document.getElementById('simVolSlider');
  const ahtSlider = document.getElementById('simAHTSlider');
  const fteSlider = document.getElementById('simFTESlider');
  if (!volSlider) return;

  function updateSim() {
    const volAdj = parseInt(volSlider.value) || 0;
    const ahtAdj = parseInt(ahtSlider.value) || 0;
    const fteAdj = parseInt(fteSlider.value) || 0;

    document.getElementById('simVolVal').textContent = (volAdj >= 0 ? '+' : '') + volAdj + '%';
    document.getElementById('simAHTVal').textContent = (ahtAdj >= 0 ? '+' : '') + ahtAdj + ' sec';
    document.getElementById('simFTEVal').textContent = (fteAdj >= 0 ? '+' : '') + fteAdj;

    const a = state.analysis;
    let latBl = null;
    if (a) for (let i = N - 1; i >= 0; i--) { if (a.blended[i] !== null) { latBl = a.blended[i]; break; } }

    const baseVol = latBl || state.dailyForecast || 2000;
    const baseAHT = 300; // seconds default
    const baseAvailCap = state.availableCapacity || 2400;

    const adjVol = baseVol * (1 + volAdj / 100);
    const adjAHT = baseAHT + ahtAdj;
    // Erlang approximation: FTE ≈ (Volume × AHT) / (3600 × occupancy × interval_seconds)
    const reqFTE = Math.ceil((adjVol * adjAHT) / (3600 * 0.85 * (N * 15 * 60 / N)));
    const availFTE = Math.ceil(baseAvailCap / (baseAHT / 60)) + fteAdj;
    const gap = availFTE - reqFTE;
    const riskLevel = gap < -5 ? 'HIGH' : gap < 0 ? 'MEDIUM' : 'LOW';

    const volResultEl = document.getElementById('simVolResultVal');
    const fteResultEl = document.getElementById('simFTEResultVal');
    const gapResultEl = document.getElementById('simGapResultVal');
    const riskResultEl = document.getElementById('simRiskResultVal');

    if (volResultEl) volResultEl.textContent = Math.round(adjVol).toLocaleString();
    if (fteResultEl) fteResultEl.textContent = reqFTE;
    if (gapResultEl) {
      gapResultEl.textContent = (gap >= 0 ? '+' : '') + gap;
      gapResultEl.style.color = gap >= 0 ? 'var(--em)' : gap >= -5 ? 'var(--am)' : 'var(--rose)';
    }
    if (riskResultEl) {
      riskResultEl.textContent = riskLevel;
      riskResultEl.style.color = riskLevel === 'HIGH' ? 'var(--rose)' : riskLevel === 'MEDIUM' ? 'var(--am)' : 'var(--em)';
    }

    const fteCard = document.getElementById('simGapResult');
    if (fteCard) {
      fteCard.style.borderColor = gap >= 0 ? 'rgba(52,211,153,.25)' : gap >= -5 ? 'rgba(251,191,36,.25)' : 'rgba(251,113,133,.25)';
    }
  }

  volSlider.addEventListener('input', updateSim);
  ahtSlider.addEventListener('input', updateSim);
  fteSlider.addEventListener('input', updateSim);
  updateSim();
}

/* ─────────────────────────────────────────────────────────
   §28  MISTAKE DETECTOR
───────────────────────────────────────────────────────── */
function renderMistakeDetector(a) {
  const section = document.getElementById('mistakeSection');
  const el = document.getElementById('mistakeDetector');
  if (!el || !section) return;

  if (!a || a.overallVariance === null) {
    section.style.display = 'none';
    return;
  }

  const mistakes = [];
  const ov = Math.abs(a.overallVariance);
  const lastDataIdx = a.cumActual.reduce((v, x, i) => x !== null ? i : v, -1);
  const timePct = lastDataIdx >= 0 ? (lastDataIdx + 1) / N * 100 : 0;

  if (ov < 3 && ov > 0) {
    mistakes.push({
      icon: '🧘',
      title: 'Variance Within Normal Range',
      text: 'Variance is below 3%. Avoid overreacting — small fluctuations are normal in contact center environments. Continue monitoring without taking premature staffing action.',
    });
  }
  if (timePct < 30 && timePct > 0) {
    mistakes.push({
      icon: '⏳',
      title: 'Too Early for Major Decisions',
      text: `Only ${timePct.toFixed(0)}% of the day has elapsed. Early-day data has lower confidence and patterns often self-correct. Avoid making large staffing changes until at least 30–40% of the day has passed.`,
    });
  }
  if (a.variability?.cls === 'var-high') {
    mistakes.push({
      icon: '📊',
      title: 'High Variability — Low Forecast Confidence',
      text: `Historical variability is ${a.variability.pct.toFixed(1)}%. This means the arrival pattern is unpredictable. Use wider tolerance bands and be cautious about using historical pattern for reforecasting.`,
    });
  }

  if (mistakes.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  el.innerHTML = mistakes.map(m => `
    <div class="mistake-item">
      <span class="mistake-icon">${m.icon}</span>
      <div class="mistake-text">
        <div class="mistake-title">${m.title}</div>
        ${m.text}
      </div>
    </div>
  `).join('');
}

/* ─────────────────────────────────────────────────────────
   §29  ENHANCED CO-PILOT (Anthropic API)
───────────────────────────────────────────────────────── */
const copilotMemory = [];

function buildCopilotContext(a) {
  if (!a || a.overallVariance === null) return null;
  let latRF = null; for (let i = N - 1; i >= 0; i--) { if (a.reforecast[i] !== null) { latRF = a.reforecast[i]; break; } }
  let latBl = null; for (let i = N - 1; i >= 0; i--) { if (a.blended[i] !== null) { latBl = a.blended[i]; break; } }
  const lastDataIdx = a.cumActual.reduce((v, x, i) => x !== null ? i : v, -1);
  const timePct = lastDataIdx >= 0 ? ((lastDataIdx + 1) / N * 100).toFixed(1) : '0';
  const latestCum = lastDataIdx >= 0 ? a.cumActual[lastDataIdx] : null;
  const backlogStatus = a.backlog.reduce((v, x) => x ? x.status : v, 'safe');
  const riskScore = calcRiskScore(a);

  return {
    volumeVariancePct: a.overallVariance?.toFixed(2),
    timePassed: timePct + '%',
    cumulativeActual: latestCum,
    reforecastEOD: latRF ? Math.round(latRF) : null,
    blendedEOD: latBl ? Math.round(latBl) : null,
    dailyForecast: a.dailyForecast,
    availableCapacity: a.availCap,
    trafficPattern: a.trafficPattern?.label,
    spikeLevel: a.spikeSummary?.level,
    backlogStatus,
    forecastConfidence: a.confidence.reduce((v, x) => x ? x.level : v, null),
    forecastAccuracy: a.accuracy?.accuracy?.toFixed(1),
    variabilityIndex: a.variability?.label,
    riskScore,
    periods: {
      morning: a.periods?.morning?.avg?.toFixed(1),
      midday: a.periods?.midday?.avg?.toFixed(1),
      afternoon: a.periods?.afternoon?.avg?.toFixed(1),
      evening: a.periods?.evening?.avg?.toFixed(1),
    },
  };
}

async function sendCopilotMessage(userMsg) {
  const a = state.analysis;
  const ctx = buildCopilotContext(a);

  const systemPrompt = `You are an elite WFM (Workforce Management) Copilot with 10+ years of real-world experience as an intraday analyst and WFM lead. You operate in a live contact center operations environment.

You ALWAYS respond using this exact structure:
1. 🧠 **Situation Summary** — 2-3 sentences on what's happening right now
2. 🔍 **Root Cause Analysis** — ranked list of likely causes
3. 📉 **Impact Projection** — what will happen if no action is taken
4. ⚡ **Recommended Actions** — split into:
   - Immediate (0–30 min)
   - Short-term (1–3 hrs)
5. ⚠️ **Trade-offs / Risks** — what could go wrong with the recommended actions
6. 🎯 **Confidence Level** — High / Medium / Low, with reason

Adapt tone:
- Risk score > 60: urgent, direct, action-focused
- Risk score 35–60: advisory, balanced
- Risk score < 35 or time < 30%: cautious, measured

Use WFM terminology naturally: AHT, AUX, occupancy, SLA, shrinkage, adherence, VTO, OT, reforecast, Erlang, interval, run-rate.

Current operational data:
${ctx ? JSON.stringify(ctx, null, 2) : 'No data loaded yet'}`;

  const messages = [...copilotMemory, { role: 'user', content: userMsg }];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Unable to get a response.';

    // Store in memory (keep last 6 turns)
    copilotMemory.push({ role: 'user', content: userMsg });
    copilotMemory.push({ role: 'assistant', content: reply });
    if (copilotMemory.length > 12) copilotMemory.splice(0, 2);

    return reply;
  } catch (err) {
    // Fallback to rule-based
    return generateWFMInsight(ctx);
  }
}

function upgradeCopilot() {
  const panel = document.getElementById('copilotPanel');
  const toggle = document.getElementById('copilotToggle');
  const collapse = document.getElementById('copilotCollapse');
  const sendBtn = document.getElementById('copilotSend');
  const input = document.getElementById('copilotInput');
  const messages = document.getElementById('copilotMessages');
  if (!panel || !sendBtn) return;

  // Upgrade toggle button
  toggle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.2"/>
      <path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
      <circle cx="8" cy="8" r="2" fill="currentColor" opacity=".8"/>
    </svg>
    <span style="font-size:.68rem;letter-spacing:.04em">AI COPILOT</span>
  `;
  toggle.style.cssText += 'display:flex;align-items:center;gap:.35rem;padding:.45rem .75rem;';

  const appendMsg = (text, who, loading = false) => {
    const m = document.createElement('div');
    m.className = `copilot-msg copilot-msg--${who}`;
    if (loading) {
      m.innerHTML = '<span class="copilot-typing"><span></span><span></span><span></span></span>';
    } else {
      // Convert markdown-lite bold and line breaks
      m.innerHTML = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    }
    messages.appendChild(m);
    messages.scrollTop = messages.scrollHeight;
    return m;
  };

  const send = async () => {
    const q = input.value.trim();
    if (!q) return;
    appendMsg(q, 'user');
    input.value = '';
    sendBtn.disabled = true;

    const loadingMsg = appendMsg('', 'ai', true);
    const reply = await sendCopilotMessage(q);
    loadingMsg.remove();
    appendMsg(reply, 'ai');
    sendBtn.disabled = false;
    messages.scrollTop = messages.scrollHeight;
  };

  // Remove old listeners by replacing elements
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  newSend.addEventListener('click', send);
  newInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  const setOpen = open => {
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  if (collapse) collapse.addEventListener('click', () => setOpen(false));

  // Upgrade panel styling
  panel.style.cssText += 'height:480px;';
  messages.innerHTML = '';
  appendMsg('👋 I\'m your **WFM AI Copilot** — powered by Claude.\n\nLoad your intraday data and ask me anything:\n• "What\'s the current risk?"\n• "Should I offer VTO?"\n• "Can we recover SLA?"\n• "Why is volume spiking?"', 'ai');
}

// Add typing indicator CSS
const typingStyle = document.createElement('style');
typingStyle.textContent = `
.copilot-typing { display:flex; gap:3px; align-items:center; padding:2px 0; }
.copilot-typing span {
  width:5px; height:5px; border-radius:50%; background:var(--sky); opacity:.6;
  animation: typing-bounce .9s ease-in-out infinite;
}
.copilot-typing span:nth-child(2) { animation-delay:.15s; }
.copilot-typing span:nth-child(3) { animation-delay:.3s; }
@keyframes typing-bounce {
  0%,80%,100% { transform:translateY(0); opacity:.4; }
  40% { transform:translateY(-5px); opacity:1; }
}
.copilot-msg { white-space: pre-wrap; }
`;
document.head.appendChild(typingStyle);

/* ─────────────────────────────────────────────────────────
   §30  ABOUT SECTION INTERACTIONS
───────────────────────────────────────────────────────── */
function initAboutInteractions() {
  const shareBtn = document.getElementById('shareToolBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const shareBanner = document.getElementById('shareBanner');

  const copyURL = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    if (shareBanner) {
      shareBanner.style.display = '';
      setTimeout(() => { shareBanner.style.display = 'none'; }, 3000);
    }
    showToast('Link copied to clipboard!');
  };

  if (shareBtn) shareBtn.addEventListener('click', copyURL);
  if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyURL);
}

/* ─────────────────────────────────────────────────────────
   INIT v5 EXTENSIONS
───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // These run AFTER the main DOMContentLoaded in the original script
  setTimeout(() => {
    initSimulator();
    upgradeCopilot();
    initAboutInteractions();
  }, 100);
});

