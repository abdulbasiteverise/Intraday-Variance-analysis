/**
 * INTRADAY FORECASTING DASHBOARD — script.js
 * Author: Abdul Basit | Workforce Intelligence Suite
 * Upgraded: Extended intervals (8:00–23:00), Historical Completion %,
 *           Historical Projection, Run-Rate Projection, Remaining Calls,
 *           Confidence Indicator, Traffic Pattern Detection, Summary Panel.
 */

/* ============================================================
   1. CONFIGURATION & INTERVALS
   ============================================================ */

/** Generate all 15-minute intervals from 8:00 to 23:00 */
function generateIntervals(startHour, endHour) {
  const intervals = [];
  for (let h = startHour; h <= endHour; h++) {
    const minutes = (h === endHour) ? [0] : [0, 15, 30, 45];
    minutes.forEach(m => {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      intervals.push(`${h}:${mm}`);
    });
  }
  return intervals;
}

const INTERVALS = generateIntervals(8, 23); // 8:00 → 23:00 → 61 intervals

/** Deviation thresholds */
const THRESHOLDS = { normal: 5, drifting: 10 };

/** Chart instances */
const charts = { arrival: null, deviation: null, projection: null };

/* ============================================================
   2. STATE
   ============================================================ */
const state = {
  rows: [],
  analysis: null,
};

/* ============================================================
   3. TABLE RENDERING
   ============================================================ */
function buildTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  state.rows = [];

  INTERVALS.forEach((interval, idx) => {
    const row = { interval, days: [null, null, null, null, null], today: null };
    state.rows.push(row);

    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    // Interval label
    const tdLabel = document.createElement('td');
    tdLabel.textContent = interval;
    tr.appendChild(tdLabel);

    // Day 1–5 inputs
    for (let d = 0; d < 5; d++) {
      const td = document.createElement('td');
      const input = createNumberInput(`day-${idx}-${d}`, `Day ${d + 1} at ${interval}`);
      input.addEventListener('input', () => {
        row.days[d] = parseFloat(input.value) || null;
        onDataChange();
      });
      td.appendChild(input);
      tr.appendChild(td);
    }

    // Historical Average (auto)
    const tdHist = document.createElement('td');
    tdHist.className = 'cell-hist';
    tdHist.id = `hist-${idx}`;
    tdHist.textContent = '—';
    tr.appendChild(tdHist);

    // Historical Completion % (auto)
    const tdCompletion = document.createElement('td');
    tdCompletion.className = 'cell-completion';
    tdCompletion.id = `completion-${idx}`;
    tdCompletion.textContent = '—';
    tr.appendChild(tdCompletion);

    // Today Actual input
    const tdToday = document.createElement('td');
    tdToday.className = 'cell-today';
    const todayInput = createNumberInput(`today-${idx}`, `Today's actual at ${interval}`);
    todayInput.addEventListener('input', () => {
      row.today = parseFloat(todayInput.value) || null;
      onDataChange();
    });
    tdToday.appendChild(todayInput);
    tr.appendChild(tdToday);

    // Deviation % (auto)
    const tdDev = document.createElement('td');
    tdDev.className = 'cell-dev cell-dev--neutral';
    tdDev.id = `dev-${idx}`;
    tdDev.textContent = '—';
    tr.appendChild(tdDev);

    // Historical Projection (auto)
    const tdProj = document.createElement('td');
    tdProj.className = 'cell-proj';
    tdProj.id = `proj-${idx}`;
    tdProj.textContent = '—';
    tr.appendChild(tdProj);

    // Run-Rate Projection (auto)
    const tdRunRate = document.createElement('td');
    tdRunRate.className = 'cell-runrate';
    tdRunRate.id = `runrate-${idx}`;
    tdRunRate.textContent = '—';
    tr.appendChild(tdRunRate);

    // Remaining Calls (auto)
    const tdRemaining = document.createElement('td');
    tdRemaining.className = 'cell-remaining';
    tdRemaining.id = `remaining-${idx}`;
    tdRemaining.textContent = '—';
    tr.appendChild(tdRemaining);

    // Confidence (auto)
    const tdConf = document.createElement('td');
    tdConf.id = `conf-${idx}`;
    tdConf.textContent = '—';
    tr.appendChild(tdConf);

    tbody.appendChild(tr);
  });
}

function createNumberInput(id, label) {
  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.min = '0';
  input.step = '1';
  input.setAttribute('aria-label', label);
  return input;
}

/* ============================================================
   4. CORE CALCULATIONS
   ============================================================ */

/** Calculate historical average per interval */
function calculateHistoricalAverage() {
  return state.rows.map(row => {
    const values = row.days.filter(v => v !== null && !isNaN(v));
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  });
}

/** Calculate Historical Completion %
 *  completion[i] = cumulative_hist[0..i] / total_hist_day
 */
function calculateHistoricalCompletion(histAvgs) {
  const validTotal = histAvgs.reduce((s, v) => s + (v || 0), 0);
  if (validTotal === 0) return new Array(INTERVALS.length).fill(null);

  const completions = [];
  let cumulative = 0;
  histAvgs.forEach(avg => {
    cumulative += (avg || 0);
    completions.push(validTotal > 0 ? cumulative / validTotal : null);
  });
  return completions;
}

/** Calculate deviation per interval */
function calculateDeviation(histAvgs) {
  return state.rows.map((row, idx) => {
    const hist = histAvgs[idx];
    const today = row.today;
    if (hist === null || today === null || hist === 0) return null;
    return ((today - hist) / hist) * 100;
  });
}

/** Cumulative actual calls up to each interval */
function calculateCumulativeActual() {
  const cumulative = [];
  let running = 0;
  state.rows.forEach(row => {
    if (row.today !== null) running += row.today;
    cumulative.push(row.today !== null ? running : null);
  });
  return cumulative;
}

/** Cumulative historical average up to each interval */
function calculateCumulativeHistorical(histAvgs) {
  const cumulative = [];
  let running = 0;
  histAvgs.forEach(avg => {
    if (avg !== null) running += avg;
    cumulative.push(avg !== null ? running : null);
  });
  return cumulative;
}

/**
 * Historical Projection at each interval:
 * = Today's cumulative actual ÷ Historical Completion %
 */
function calculateHistoricalProjection(cumActual, completions) {
  return cumActual.map((cum, idx) => {
    const comp = completions[idx];
    if (cum === null || !comp || comp === 0) return null;
    return cum / comp;
  });
}

/**
 * Run-Rate Projection at each interval:
 * = Today's cumulative actual ÷ (intervals completed / total intervals)
 */
function calculateRunRateProjection(cumActual) {
  const totalIntervals = INTERVALS.length;
  return cumActual.map((cum, idx) => {
    if (cum === null) return null;
    const dayCompletionPct = (idx + 1) / totalIntervals;
    return cum / dayCompletionPct;
  });
}

/**
 * Remaining Expected Calls:
 * = Historical Projection[i] - Today's cumulative actual[i]
 */
function calculateRemainingCalls(histProjection, cumActual) {
  return histProjection.map((proj, idx) => {
    if (proj === null || cumActual[idx] === null) return null;
    return Math.max(0, Math.round(proj - cumActual[idx]));
  });
}

/**
 * Projection Confidence:
 * Compares Run-Rate vs Historical Projection
 * Green: diff < 5%, Yellow: 5–10%, Red: > 10%
 */
function calculateConfidence(histProjection, runRateProjection) {
  return histProjection.map((hist, idx) => {
    const runRate = runRateProjection[idx];
    if (hist === null || runRate === null || hist === 0) return null;
    const diffPct = Math.abs((runRate - hist) / hist) * 100;
    if (diffPct < 5)  return { level: 'green',   label: 'High',   diffPct };
    if (diffPct < 10) return { level: 'yellow',  label: 'Medium', diffPct };
    return               { level: 'red',    label: 'Low',    diffPct };
  });
}

/** Overall average deviation */
function calculateOverallVariance(deviations) {
  const valid = deviations.filter(d => d !== null);
  if (valid.length === 0) return null;
  return valid.reduce((s, d) => s + d, 0) / valid.length;
}

/** Largest spike */
function findLargestSpike(deviations) {
  let max = -Infinity, spikeIdx = -1;
  deviations.forEach((dev, idx) => { if (dev !== null && dev > max) { max = dev; spikeIdx = idx; } });
  return spikeIdx === -1 ? null : { interval: INTERVALS[spikeIdx], deviation: max };
}

/** Largest dip */
function findLargestDip(deviations) {
  let min = Infinity, dipIdx = -1;
  deviations.forEach((dev, idx) => { if (dev !== null && dev < min) { min = dev; dipIdx = idx; } });
  return dipIdx === -1 ? null : { interval: INTERVALS[dipIdx], deviation: min };
}

/** Period deviations */
function calculatePeriodDeviations(deviations) {
  const periods = {
    morning:   { label: 'Morning (8:00–10:45)',   range: [0, 11]  },
    midday:    { label: 'Midday (11:00–13:45)',   range: [12, 23] },
    afternoon: { label: 'Afternoon (14:00–17:45)', range: [24, 39] },
    evening:   { label: 'Evening (18:00–23:00)',   range: [40, 60] },
  };
  const result = {};
  Object.entries(periods).forEach(([key, { label, range }]) => {
    const slice = deviations.slice(range[0], range[1] + 1).filter(d => d !== null);
    result[key] = { label, avg: slice.length ? slice.reduce((s, d) => s + d, 0) / slice.length : null };
  });
  return result;
}

/* ============================================================
   5. PATTERN CLASSIFICATION
   ============================================================ */
function detectPatternStatus(overallVariance) {
  if (overallVariance === null) return { label: '—', level: 'unknown' };
  const abs = Math.abs(overallVariance);
  if (abs <= THRESHOLDS.normal)   return { label: 'NORMAL',          level: 'normal' };
  if (abs <= THRESHOLDS.drifting) return { label: 'DRIFTING',        level: 'drifting' };
  return                                  { label: 'MAJOR DEVIATION', level: 'major' };
}

function classifyServiceRisk(overallVariance) {
  if (overallVariance === null) return { label: '—', level: 'unknown', message: '' };
  const abs = Math.abs(overallVariance);
  if (abs <= 5)  return { label: 'LOW',      level: 'low',      message: 'Staffing alignment is within acceptable tolerance.' };
  if (abs <= 10) return { label: 'MODERATE', level: 'moderate', message: 'Monitor for further pattern drift before adjusting.' };
  return              { label: 'HIGH',     level: 'high',     message: 'Arrival pattern deviation may impact staffing alignment.' };
}

/**
 * Traffic Pattern Detection:
 * Analyzes early vs late interval deviations.
 */
function detectTrafficPattern(periods) {
  const morning = periods.morning.avg;
  const afternoon = periods.afternoon.avg;
  const evening = periods.evening ? periods.evening.avg : null;

  if (morning === null && afternoon === null) return { label: '—', type: 'unknown' };

  // Front-loaded: Morning higher than avg, afternoon/evening lower
  if (morning !== null && afternoon !== null) {
    if (morning > 5 && afternoon < -2)
      return { label: 'Front-Loaded Traffic', type: 'front', desc: 'Higher volumes early, tapering off in the afternoon.' };
    if (morning < -5 && afternoon > 2)
      return { label: 'Delayed Peak', type: 'delayed', desc: 'Lower volumes early with traffic building later in the day.' };
  }

  // Check evening surge
  if (evening !== null && evening > 8 && (morning === null || morning < 2))
    return { label: 'Late Evening Surge', type: 'delayed', desc: 'Unusually high volumes detected in evening hours.' };

  // Normal
  const allDevs = [morning, afternoon, evening].filter(v => v !== null);
  const maxAbs = Math.max(...allDevs.map(Math.abs));
  if (maxAbs <= 5)
    return { label: 'Normal Pattern', type: 'normal', desc: 'Traffic closely tracking historical distribution.' };

  return { label: 'Normal Pattern', type: 'normal', desc: 'Traffic pattern within expected ranges.' };
}

/* ============================================================
   6. EXECUTIVE SUMMARY
   ============================================================ */
function generateExecutiveSummary(analysis) {
  if (!analysis) return null;
  const { periods, spike, dip, overallVariance, status, risk } = analysis;
  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
  const lines = [];

  if (periods.morning.avg !== null)   lines.push(`Morning period: ${describeDeviation(periods.morning.avg)} (${fmt(periods.morning.avg)})`);
  if (periods.midday.avg !== null)    lines.push(`Midday period: ${describeDeviation(periods.midday.avg)} (${fmt(periods.midday.avg)})`);
  if (periods.afternoon.avg !== null) lines.push(`Afternoon period: ${describeDeviation(periods.afternoon.avg)} (${fmt(periods.afternoon.avg)})`);
  if (periods.evening && periods.evening.avg !== null)  lines.push(`Evening period: ${describeDeviation(periods.evening.avg)} (${fmt(periods.evening.avg)})`);
  if (spike) lines.push(`Largest spike at ${spike.interval} (${fmt(spike.deviation)})`);
  if (dip)   lines.push(`Largest dip at ${dip.interval} (${fmt(dip.deviation)})`);
  if (overallVariance !== null) lines.push(`Average interval deviation: ${fmt(overallVariance)}`);

  return {
    lines,
    interpretation: buildInterpretation(analysis),
    recommendation: buildRecommendation(status),
  };
}

function describeDeviation(pct) {
  if (pct === null) return 'No data';
  const abs = Math.abs(pct);
  const dir = pct > 0 ? 'above' : 'below';
  if (abs <= 2)  return 'Tracking at expected levels';
  if (abs <= 5)  return `Slightly ${dir} historical average`;
  if (abs <= 10) return `Moderately ${dir} historical average`;
  return `Significantly ${dir} historical average`;
}

function buildInterpretation(analysis) {
  const { periods, overallVariance, trafficPattern } = analysis;
  if (overallVariance === null) return 'Insufficient data for interpretation.';
  if (trafficPattern && trafficPattern.desc) return trafficPattern.desc;
  if (Math.abs(overallVariance) <= 3) return "Today's arrival pattern is closely tracking historical norms across all periods.";
  if (overallVariance > 5)  return "Overall volumes are running above historical averages — demand pressure is elevated.";
  if (overallVariance < -5) return "Overall volumes are running below historical averages — traffic is softer than expected.";
  return "Today's pattern shows minor deviations from historical norms. Continued monitoring recommended.";
}

function buildRecommendation(status) {
  switch (status.level) {
    case 'normal':   return 'No immediate staffing action required. Continue standard monitoring cadence.';
    case 'drifting': return 'Monitor upcoming intervals closely before making staffing adjustments.';
    case 'major':    return 'Consider initiating an intraday reforecast. Staffing alignment review recommended.';
    default:         return 'Enter data to generate a recommendation.';
  }
}

/* ============================================================
   7. OPERATIONAL INSIGHT
   ============================================================ */
function generateOperationalInsight(status, risk) {
  const actions = [];
  switch (status.level) {
    case 'normal':
      actions.push({ type: 'green',  icon: '✓', text: 'No action required — pattern within normal bounds.' });
      break;
    case 'drifting':
      actions.push({ type: 'yellow', icon: '⚠', text: 'Monitor upcoming intervals before adjusting staffing.' });
      actions.push({ type: 'yellow', icon: '↻', text: 'Prepare contingency reforecast if drift continues.' });
      break;
    case 'major':
      actions.push({ type: 'red',    icon: '⛔', text: 'Consider intraday reforecast — significant deviation detected.' });
      actions.push({ type: 'red',    icon: '👥', text: 'Review staffing alignment with operations lead.' });
      break;
    default:
      actions.push({ type: 'green',  icon: '○', text: 'Awaiting data — enter volumes to generate insight.' });
  }
  return actions;
}

/* ============================================================
   8. PERIOD BREAKDOWN
   ============================================================ */
function renderPeriodBreakdown(periods) {
  const container = document.getElementById('periodBreakdown');
  if (!periods) {
    container.innerHTML = '<p class="panel__placeholder">Period analysis will appear here.</p>';
    return;
  }
  const rows = Object.values(periods).map(p => {
    const val = p.avg !== null ? `${p.avg > 0 ? '+' : ''}${p.avg.toFixed(1)}%` : '—';
    const cls = p.avg === null ? 'cell-dev--neutral'
              : Math.abs(p.avg) <= 5  ? 'cell-dev--green'
              : Math.abs(p.avg) <= 10 ? 'cell-dev--yellow'
              : 'cell-dev--red';
    return `<div class="period-row">
      <span class="period-label">${p.label}</span>
      <span class="period-val ${cls}">${val}</span>
    </div>`;
  }).join('');
  container.innerHTML = rows;
}

/* ============================================================
   9. SERVICE RISK CARD
   ============================================================ */
function updateRiskCard(risk) {
  const card = document.getElementById('card-risk');
  const valEl = document.getElementById('riskValue');
  const tagEl = document.getElementById('riskTag');
  card.classList.remove('risk--low', 'risk--moderate', 'risk--high');
  valEl.textContent = risk.label;
  tagEl.textContent = risk.message || 'Risk level';
  if (risk.level !== 'unknown') card.classList.add(`risk--${risk.level}`);
}

/* ============================================================
   10. CHARTS
   ============================================================ */
const CHART_COLORS = {
  blue:      '#2563eb',
  blueLight: 'rgba(37,99,235,0.12)',
  purple:    '#7c3aed',
  purpleLight: 'rgba(124,58,237,0.08)',
  green:     '#059669',
  greenLight: 'rgba(5,150,105,0.1)',
  amber:     '#d97706',
  amberLight: 'rgba(217,119,6,0.1)',
  red:       '#dc2626',
  redLight:  'rgba(220,38,38,0.15)',
  grid:      'rgba(15,23,42,0.06)',
  axis:      'rgba(15,23,42,0.12)',
  text:      '#94a3b8',
};

function initCharts() {
  Chart.defaults.color       = CHART_COLORS.text;
  Chart.defaults.font.family = "'Outfit', sans-serif";
  Chart.defaults.font.size   = 11;

  const labels = INTERVALS;

  // 1. Arrival Curves
  charts.arrival = new Chart(document.getElementById('arrivalChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Historical Average',
          data: new Array(INTERVALS.length).fill(null),
          borderColor: CHART_COLORS.blue,
          backgroundColor: CHART_COLORS.blueLight,
          borderWidth: 2,
          pointRadius: 1.5,
          pointBackgroundColor: CHART_COLORS.blue,
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Today Actual',
          data: new Array(INTERVALS.length).fill(null),
          borderColor: CHART_COLORS.purple,
          backgroundColor: CHART_COLORS.purpleLight,
          borderWidth: 2,
          pointRadius: 1.5,
          pointBackgroundColor: CHART_COLORS.purple,
          borderDash: [5, 3],
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: buildLineOptions(),
  });

  // 2. Deviation Bar
  charts.deviation = new Chart(document.getElementById('deviationChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Deviation %',
        data: new Array(INTERVALS.length).fill(null),
        backgroundColor: new Array(INTERVALS.length).fill('rgba(37,99,235,0.4)'),
        borderColor: new Array(INTERVALS.length).fill(CHART_COLORS.blue),
        borderWidth: 1,
        borderRadius: 2,
      }],
    },
    options: buildBarOptions(),
  });

  // 3. Projection comparison
  charts.projection = new Chart(document.getElementById('projectionChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Historical Projection',
          data: new Array(INTERVALS.length).fill(null),
          borderColor: CHART_COLORS.green,
          backgroundColor: CHART_COLORS.greenLight,
          borderWidth: 2,
          pointRadius: 1.5,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Run-Rate Projection',
          data: new Array(INTERVALS.length).fill(null),
          borderColor: CHART_COLORS.amber,
          backgroundColor: CHART_COLORS.amberLight,
          borderWidth: 2,
          pointRadius: 1.5,
          borderDash: [4, 3],
          tension: 0.4,
          fill: false,
        },
      ],
    },
    options: buildLineOptions(true),
  });
}

function buildLineOptions(compact = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 10, padding: 14, color: '#475569', font: { size: 11 } } },
      tooltip: buildTooltipStyle(),
    },
    scales: {
      x: buildXScale(compact),
      y: buildYScale(),
    },
    animation: { duration: 400, easing: 'easeInOutQuart' },
  };
}

function buildBarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: buildTooltipStyle(),
    },
    scales: {
      x: buildXScale(false),
      y: {
        ...buildYScale(),
        title: { display: true, text: 'Deviation %', color: '#94a3b8', font: { size: 10 } },
      },
    },
    animation: { duration: 400 },
  };
}

function buildTooltipStyle() {
  return {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderColor: 'rgba(37,99,235,0.2)',
    borderWidth: 1,
    titleColor: '#f1f5f9',
    bodyColor: '#94a3b8',
    padding: 10,
    cornerRadius: 8,
  };
}

function buildXScale(compact = false) {
  return {
    ticks: {
      color: '#94a3b8',
      maxRotation: 45,
      autoSkip: true,
      maxTicksLimit: compact ? 8 : 12,
      font: { size: 9 },
    },
    grid: { color: CHART_COLORS.grid },
    border: { color: CHART_COLORS.axis },
  };
}

function buildYScale() {
  return {
    ticks: { color: '#94a3b8', font: { size: 10 } },
    grid: { color: CHART_COLORS.grid },
    border: { color: CHART_COLORS.axis },
  };
}

function updateCharts(histAvgs, deviations, histProjections, runRateProjections) {
  // Arrival
  charts.arrival.data.datasets[0].data = histAvgs.map(v => v !== null ? +v.toFixed(1) : null);
  charts.arrival.data.datasets[1].data = state.rows.map(r => r.today);
  charts.arrival.update('active');

  // Deviation bars with color by deviation level
  const devData = deviations.map(d => d !== null ? +d.toFixed(2) : null);
  const barColors = devData.map(d => {
    if (d === null) return 'rgba(148,163,184,0.3)';
    const abs = Math.abs(d);
    if (abs <= 5)  return d > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(22,163,74,0.35)';
    if (abs <= 10) return d > 0 ? 'rgba(217,119,6,0.5)' : 'rgba(217,119,6,0.35)';
    return d > 0 ? 'rgba(220,38,38,0.6)' : 'rgba(220,38,38,0.5)';
  });
  const borderColors = devData.map(d => {
    if (d === null) return '#94a3b8';
    const abs = Math.abs(d);
    if (abs <= 5)  return d > 0 ? '#ef4444' : '#16a34a';
    if (abs <= 10) return '#d97706';
    return '#dc2626';
  });
  charts.deviation.data.datasets[0].data = devData;
  charts.deviation.data.datasets[0].backgroundColor = barColors;
  charts.deviation.data.datasets[0].borderColor = borderColors;
  charts.deviation.update('active');

  // Projections
  charts.projection.data.datasets[0].data = histProjections.map(v => v !== null ? +v.toFixed(0) : null);
  charts.projection.data.datasets[1].data = runRateProjections.map(v => v !== null ? +v.toFixed(0) : null);
  charts.projection.update('active');
}

/* ============================================================
   11. SUMMARY PANEL UPDATE
   ============================================================ */
function updateSummaryPanel(analysis) {
  const { cumActual, cumHistorical, histProjection, runRateProjection, trafficPattern, deviations } = analysis;

  // Find last valid index
  let lastIdx = -1;
  for (let i = cumActual.length - 1; i >= 0; i--) {
    if (cumActual[i] !== null) { lastIdx = i; break; }
  }

  const fmt = v => v !== null ? Math.round(v).toLocaleString() : '—';
  const fmtPct = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

  // Cumulative actual
  document.getElementById('siCumActual').textContent = lastIdx >= 0 ? fmt(cumActual[lastIdx]) : '—';

  // Expected by now (cumulative hist at same point)
  const expectedNow = lastIdx >= 0 ? cumHistorical[lastIdx] : null;
  document.getElementById('siCumExpected').textContent = fmt(expectedNow);

  // Variance %
  const varPct = (expectedNow && expectedNow > 0 && lastIdx >= 0 && cumActual[lastIdx] !== null)
    ? ((cumActual[lastIdx] - expectedNow) / expectedNow) * 100 : null;
  const varEl = document.getElementById('siVariancePct');
  varEl.textContent = fmtPct(varPct);
  varEl.style.color = varPct === null ? '' : Math.abs(varPct) <= 5 ? '#16a34a' : Math.abs(varPct) <= 10 ? '#d97706' : '#dc2626';

  // Historical Projection (latest valid)
  let latestHistProj = null;
  for (let i = histProjection.length - 1; i >= 0; i--) {
    if (histProjection[i] !== null) { latestHistProj = histProjection[i]; break; }
  }
  document.getElementById('siHistProj').textContent = fmt(latestHistProj);

  // Run-Rate Projection
  let latestRunRate = null;
  for (let i = runRateProjection.length - 1; i >= 0; i--) {
    if (runRateProjection[i] !== null) { latestRunRate = runRateProjection[i]; break; }
  }
  document.getElementById('siRunRate').textContent = fmt(latestRunRate);

  // Confidence (from last interval)
  let latestConf = null;
  for (let i = analysis.confidence.length - 1; i >= 0; i--) {
    if (analysis.confidence[i] !== null) { latestConf = analysis.confidence[i]; break; }
  }
  const confEl = document.getElementById('siConfidence');
  if (latestConf) {
    const colors = { green: '#16a34a', yellow: '#d97706', red: '#dc2626' };
    confEl.textContent = latestConf.label;
    confEl.style.color = colors[latestConf.level] || '';
  } else {
    confEl.textContent = '—';
    confEl.style.color = '';
  }

  // Traffic Pattern
  const patternEl = document.getElementById('trafficPattern');
  if (trafficPattern && trafficPattern.label !== '—') {
    patternEl.innerHTML = `<span class="traffic-badge traffic-badge--${trafficPattern.type}">${trafficPattern.label}</span>`;
  } else {
    patternEl.textContent = '—';
  }
}

/* ============================================================
   12. EMAIL / EXPORT
   ============================================================ */
function buildPlainTextSummary(analysis) {
  if (!analysis) return 'No analysis data available. Please enter data first.';
  const { summary, status, risk, overallVariance, spike, dip, periods, trafficPattern } = analysis;
  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
  const now = new Date().toLocaleString();

  let text = `INTRADAY PATTERN ANALYSIS\n`;
  text += `Generated: ${now}\n`;
  text += `${'─'.repeat(50)}\n\n`;
  text += `PATTERN STATUS: ${status.label}\n`;
  text += `CUMULATIVE VARIANCE: ${fmt(overallVariance)}\n`;
  text += `SERVICE RISK SIGNAL: ${risk.label}\n`;
  if (trafficPattern) text += `TRAFFIC PATTERN: ${trafficPattern.label}\n`;
  text += `\nPERIOD SUMMARY\n${'─'.repeat(30)}\n`;
  Object.values(periods).forEach(p => { text += `${p.label}: ${fmt(p.avg)}\n`; });
  if (spike) text += `\nLargest Spike: ${spike.interval} (${fmt(spike.deviation)})\n`;
  if (dip)   text += `Largest Dip:   ${dip.interval} (${fmt(dip.deviation)})\n`;
  if (summary) {
    text += `\nNARRATIVE\n${'─'.repeat(30)}\n`;
    summary.lines.forEach(l => { text += `• ${l}\n`; });
    text += `\nINTERPRETATION\n${summary.interpretation}\n`;
    text += `\nRECOMMENDATION\n${summary.recommendation}\n`;
  }
  text += `\n${'─'.repeat(50)}\n`;
  text += `Intraday Pattern Deviation Analyzer | Workforce Intelligence Suite\nBuilt by Abdul Basit\n`;
  return text;
}

function exportEmailOutlook() {
  const body = buildPlainTextSummary(state.analysis);
  window.location.href = `mailto:?subject=${encodeURIComponent('Intraday Pattern Analysis – Volume Pattern Update')}&body=${encodeURIComponent(body)}`;
}

function exportEmailGmail() {
  const body = buildPlainTextSummary(state.analysis);
  window.open(`https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Intraday Pattern Analysis – Volume Pattern Update')}&body=${encodeURIComponent(body)}`, '_blank');
}

async function copySummary() {
  const text = buildPlainTextSummary(state.analysis);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast('Summary copied to clipboard');
}

function downloadReport() {
  const text = buildPlainTextSummary(state.analysis);
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `intraday-analysis-${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Report downloaded');
}

/* ============================================================
   13. UI UPDATE ORCHESTRATOR
   ============================================================ */
function onDataChange() {
  // Step 1: Historical averages
  const histAvgs = calculateHistoricalAverage();

  // Step 2: Update hist-avg cells
  histAvgs.forEach((avg, idx) => {
    const cell = document.getElementById(`hist-${idx}`);
    if (cell) cell.textContent = avg !== null ? avg.toFixed(1) : '—';
  });

  // Step 3: Historical completion %
  const completions = calculateHistoricalCompletion(histAvgs);
  completions.forEach((comp, idx) => {
    const cell = document.getElementById(`completion-${idx}`);
    if (cell) cell.textContent = comp !== null ? `${(comp * 100).toFixed(1)}%` : '—';
  });

  // Step 4: Deviations
  const deviations = calculateDeviation(histAvgs);
  deviations.forEach((dev, idx) => {
    const cell = document.getElementById(`dev-${idx}`);
    if (!cell) return;
    if (dev === null) { cell.textContent = '—'; cell.className = 'cell-dev cell-dev--neutral'; return; }
    cell.textContent = `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%`;
    const abs = Math.abs(dev);
    const cls = abs <= 5 ? 'cell-dev--green' : abs <= 10 ? 'cell-dev--yellow' : 'cell-dev--red';
    cell.className = `cell-dev ${cls}`;
  });

  // Step 5: Cumulative calculations
  const cumActual      = calculateCumulativeActual();
  const cumHistorical  = calculateCumulativeHistorical(histAvgs);
  const histProjection = calculateHistoricalProjection(cumActual, completions);
  const runRateProjection = calculateRunRateProjection(cumActual);
  const remainingCalls = calculateRemainingCalls(histProjection, cumActual);
  const confidence     = calculateConfidence(histProjection, runRateProjection);

  // Step 6: Update projection/remaining/confidence cells
  histProjection.forEach((val, idx) => {
    const cell = document.getElementById(`proj-${idx}`);
    if (cell) cell.textContent = val !== null ? Math.round(val).toLocaleString() : '—';
  });

  runRateProjection.forEach((val, idx) => {
    const cell = document.getElementById(`runrate-${idx}`);
    if (cell) cell.textContent = val !== null ? Math.round(val).toLocaleString() : '—';
  });

  remainingCalls.forEach((val, idx) => {
    const cell = document.getElementById(`remaining-${idx}`);
    if (cell) cell.textContent = val !== null ? val.toLocaleString() : '—';
  });

  confidence.forEach((conf, idx) => {
    const cell = document.getElementById(`conf-${idx}`);
    if (!cell) return;
    if (!conf) { cell.textContent = '—'; return; }
    cell.innerHTML = `<span class="confidence-badge confidence-badge--${conf.level}">
      <span class="confidence-dot"></span>${conf.label}
    </span>`;
  });

  // Step 7: Derived
  const overallVariance = calculateOverallVariance(deviations);
  const spike           = findLargestSpike(deviations);
  const dip             = findLargestDip(deviations);
  const periods         = calculatePeriodDeviations(deviations);
  const status          = detectPatternStatus(overallVariance);
  const risk            = classifyServiceRisk(overallVariance);
  const trafficPattern  = detectTrafficPattern(periods);
  const summary         = generateExecutiveSummary({ periods, spike, dip, overallVariance, status, risk, trafficPattern });

  // Step 8: Cache
  state.analysis = { histAvgs, deviations, cumActual, cumHistorical, histProjection, runRateProjection, remainingCalls, confidence, overallVariance, spike, dip, periods, status, risk, trafficPattern, summary };

  // Step 9: Update UI
  updateMetricCards(state.analysis);
  updateSummaryPanel(state.analysis);
  renderExecutiveNarrative(summary);
  renderOperationalInsight(status, risk);
  renderPeriodBreakdown(periods);
  updateRiskCard(risk);
  updateCharts(histAvgs, deviations, histProjection, runRateProjection);
  updateExportPreview(state.analysis);
}

function updateMetricCards(analysis) {
  const { overallVariance, spike, dip, status } = analysis;
  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

  const statusCard = document.getElementById('card-status');
  statusCard.classList.remove('status--normal', 'status--drifting', 'status--major');
  animateValue('statusValue', status.label);
  document.getElementById('statusTag').textContent = overallVariance !== null ? `Avg deviation: ${fmt(overallVariance)}` : 'Awaiting data';
  if (status.level !== 'unknown') statusCard.classList.add(`status--${status.level}`);

  animateValue('cumulativeValue', fmt(overallVariance));

  if (spike) { animateValue('spikeValue', fmt(spike.deviation)); document.getElementById('spikeInterval').textContent = `Interval ${spike.interval}`; }
  else { document.getElementById('spikeValue').textContent = '—'; document.getElementById('spikeInterval').textContent = 'Interval —'; }

  if (dip) { animateValue('dipValue', fmt(dip.deviation)); document.getElementById('dipInterval').textContent = `Interval ${dip.interval}`; }
  else { document.getElementById('dipValue').textContent = '—'; document.getElementById('dipInterval').textContent = 'Interval —'; }
}

function renderExecutiveNarrative(summary) {
  const container = document.getElementById('executiveNarrative');
  if (!summary) { container.innerHTML = '<p class="panel__placeholder">Load data or enter values to generate the executive summary.</p>'; return; }
  const lineHtml = summary.lines.map(line =>
    `<div class="narrative-line"><div class="narrative-bullet"></div><div>${line}</div></div>`
  ).join('');
  container.innerHTML = `
    ${lineHtml}
    <div class="narrative-section-title">Interpretation</div>
    <div class="narrative-line"><div class="narrative-bullet" style="background:#7c3aed"></div><div>${summary.interpretation}</div></div>
    <div class="narrative-section-title">Recommendation</div>
    <div class="narrative-line"><div class="narrative-bullet" style="background:#059669"></div><div>${summary.recommendation}</div></div>
  `;
}

function renderOperationalInsight(status, risk) {
  const container = document.getElementById('operationalInsight');
  const actions = generateOperationalInsight(status, risk);
  container.innerHTML = actions.map(a =>
    `<div class="insight-action insight-action--${a.type}"><span>${a.icon}</span><span>${a.text}</span></div>`
  ).join('');
}

function updateExportPreview(analysis) {
  document.getElementById('exportPreview').textContent = buildPlainTextSummary(analysis);
}

/* ============================================================
   14. MICRO-INTERACTIONS
   ============================================================ */
function animateValue(elementId, targetText) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.opacity = '0.4';
  el.style.transform = 'scale(0.94)';
  setTimeout(() => {
    el.textContent = targetText;
    el.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    el.style.opacity = '1';
    el.style.transform = 'scale(1)';
  }, 80);
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('toast--visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('toast--visible'), 2800);
}

/* ============================================================
   15. EXAMPLE DATA LOADER
   ============================================================ */
function loadExampleData() {
  // Extended historical base for 8:00–23:00 (61 intervals)
  const histBase = [
    // 8:00–8:45 (rising early)
    18, 24, 30, 38,
    // 9:00–9:45 (building)
    52, 65, 78, 88,
    // 10:00–10:45 (approaching peak)
    96, 102, 108, 114,
    // 11:00–11:45 (peak)
    118, 122, 125, 122,
    // 12:00–12:45 (midday plateau)
    112, 105, 98, 92,
    // 13:00–13:45 (early afternoon)
    88, 85, 82, 80,
    // 14:00–14:45 (afternoon build)
    84, 89, 94, 98,
    // 15:00–15:45 (secondary peak)
    102, 104, 106, 102,
    // 16:00–16:45 (declining)
    94, 84, 72, 60,
    // 17:00–17:45 (end of business)
    48, 36, 26, 18,
    // 18:00–18:45 (evening)
    14, 12, 11, 10,
    // 19:00–19:45
    9, 9, 8, 8,
    // 20:00–20:45
    7, 7, 6, 6,
    // 21:00–21:45
    5, 5, 4, 4,
    // 22:00–22:45
    3, 3, 3, 2,
    // 23:00
    2,
  ];

  // Today is slightly back-loaded: lower morning, higher mid/late-day, normal evening
  const todayShift = [
    -0.12, -0.10, -0.09, -0.08,  // 8:00–8:45
    -0.07, -0.06, -0.05, -0.04,  // 9:00–9:45
    -0.02, -0.01, 0.01, 0.02,    // 10:00–10:45
     0.02,  0.03,  0.03,  0.02,  // 11:00–11:45
    -0.02, -0.03, -0.02, -0.01,  // 12:00–12:45
     0.01,  0.02,  0.03,  0.04,  // 13:00–13:45
     0.05,  0.07,  0.09,  0.10,  // 14:00–14:45
     0.11,  0.12,  0.10,  0.09,  // 15:00–15:45
     0.08,  0.07,  0.06,  0.05,  // 16:00–16:45
     0.04,  0.03,  0.02,  0.01,  // 17:00–17:45
     0.01,  0.00, -0.01, -0.01,  // 18:00–18:45
     0.00,  0.00,  0.00,  0.00,  // 19:00–19:45
     0.00,  0.00,  0.00,  0.00,  // 20:00–20:45
     0.00,  0.00,  0.00,  0.00,  // 21:00–21:45
     0.00,  0.00,  0.00,  0.00,  // 22:00–22:45
     0.00,                        // 23:00
  ];

  // Day variance multipliers (randomized ±8%)
  const rng = (seed) => {
    const x = Math.sin(seed) * 10000;
    return 0.93 + (x - Math.floor(x)) * 0.14; // range 0.93–1.07
  };

  INTERVALS.forEach((interval, idx) => {
    const row  = state.rows[idx];
    const base = histBase[idx] || 2;
    const shift = todayShift[idx] || 0;

    for (let d = 0; d < 5; d++) {
      const mult = rng(idx * 7 + d * 13 + 42);
      const val  = Math.max(0, Math.round(base * mult));
      row.days[d] = val;
      const input = document.getElementById(`day-${idx}-${d}`);
      if (input) input.value = val;
    }

    const todayVal = Math.max(0, Math.round(base * (1 + shift)));
    row.today = todayVal;
    const todayInput = document.getElementById(`today-${idx}`);
    if (todayInput) todayInput.value = todayVal;
  });

  onDataChange();
  showToast('Example data loaded');
}

function clearData() {
  state.rows.forEach((row, idx) => {
    row.days  = [null, null, null, null, null];
    row.today = null;
    for (let d = 0; d < 5; d++) {
      const input = document.getElementById(`day-${idx}-${d}`);
      if (input) input.value = '';
    }
    const todayInput = document.getElementById(`today-${idx}`);
    if (todayInput) todayInput.value = '';
    const histCell = document.getElementById(`hist-${idx}`);
    if (histCell) histCell.textContent = '—';
    const devCell = document.getElementById(`dev-${idx}`);
    if (devCell) { devCell.textContent = '—'; devCell.className = 'cell-dev cell-dev--neutral'; }
    const completionCell = document.getElementById(`completion-${idx}`);
    if (completionCell) completionCell.textContent = '—';
    ['proj', 'runrate', 'remaining', 'conf'].forEach(prefix => {
      const cell = document.getElementById(`${prefix}-${idx}`);
      if (cell) cell.textContent = '—';
    });
  });
  state.analysis = null;
  onDataChange();
  showToast('Data cleared');
}

/* ============================================================
   16. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  buildTable();
  initCharts();
  onDataChange();

  document.getElementById('loadExampleBtn').addEventListener('click', loadExampleData);
  document.getElementById('clearDataBtn').addEventListener('click', clearData);
  document.getElementById('outlookBtn').addEventListener('click', exportEmailOutlook);
  document.getElementById('gmailBtn').addEventListener('click', exportEmailGmail);
  document.getElementById('copyBtn').addEventListener('click', copySummary);
  document.getElementById('downloadBtn').addEventListener('click', downloadReport);

  const menuToggle = document.getElementById('menuToggle');
  const navLinks   = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', navLinks.classList.contains('is-open'));
    });
  }
});
