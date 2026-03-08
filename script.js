/**
 * INTRADAY PATTERN DEVIATION ANALYZER — script.js
 * Author: Abdul Basit | Workforce Intelligence Suite
 * Sections:
 *   1. Configuration & Intervals
 *   2. State
 *   3. Table Rendering
 *   4. Core Calculations
 *   5. Pattern Classification
 *   6. Executive Summary Generator
 *   7. Operational Insight
 *   8. Period Breakdown
 *   9. Service Risk Signal
 *  10. Charts
 *  11. Email / Export
 *  12. UI Update Orchestrator
 *  13. Micro-interactions
 *  14. Event Listeners & Init
 */

/* ============================================================
   1. CONFIGURATION & INTERVALS
   ============================================================ */

/** All 15-minute intervals for a typical contact center day */
const INTERVALS = [
  '8:00','8:15','8:30','8:45',
  '9:00','9:15','9:30','9:45',
  '10:00','10:15','10:30','10:45',
  '11:00','11:15','11:30','11:45',
  '12:00','12:15','12:30','12:45',
  '13:00','13:15','13:30','13:45',
  '14:00','14:15','14:30','14:45',
  '15:00','15:15','15:30','15:45',
  '16:00','16:15','16:30','16:45',
  '17:00','17:15','17:30','17:45',
];

/** Thresholds (%) for pattern classification */
const THRESHOLDS = { normal: 5, drifting: 10 };

/** Chart instances (destroyed/recreated on update) */
const charts = { arrival: null, deviation: null, cumulative: null };

/* ============================================================
   2. STATE
   ============================================================ */

/** Central application state */
const state = {
  rows: [],        // Array of row data objects
  analysis: null,  // Latest computed analysis result
};

/* ============================================================
   3. TABLE RENDERING
   ============================================================ */

/**
 * Build the table body with one row per interval.
 * Each row has 5 day inputs, a read-only hist-avg cell,
 * a today-actual input, and a read-only deviation cell.
 */
function buildTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  state.rows = [];

  INTERVALS.forEach((interval, idx) => {
    const row = {
      interval,
      days: [null, null, null, null, null],
      today: null,
    };
    state.rows.push(row);

    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    // Interval label cell
    const tdLabel = document.createElement('td');
    tdLabel.textContent = interval;
    tr.appendChild(tdLabel);

    // Day 1–5 input cells
    for (let d = 0; d < 5; d++) {
      const td = document.createElement('td');
      const input = createNumberInput(`day-${idx}-${d}`, `Day ${d + 1} volume at ${interval}`);
      input.addEventListener('input', () => {
        row.days[d] = parseFloat(input.value) || null;
        onDataChange();
      });
      td.appendChild(input);
      tr.appendChild(td);
    }

    // Historical Average cell (auto-computed)
    const tdHist = document.createElement('td');
    tdHist.className = 'cell-hist';
    tdHist.id = `hist-${idx}`;
    tdHist.textContent = '—';
    tr.appendChild(tdHist);

    // Today Actual input cell
    const tdToday = document.createElement('td');
    tdToday.className = 'cell-today';
    const todayInput = createNumberInput(`today-${idx}`, `Today's actual volume at ${interval}`);
    todayInput.addEventListener('input', () => {
      row.today = parseFloat(todayInput.value) || null;
      onDataChange();
    });
    tdToday.appendChild(todayInput);
    tr.appendChild(tdToday);

    // Deviation % cell (auto-computed)
    const tdDev = document.createElement('td');
    tdDev.className = 'cell-dev';
    tdDev.id = `dev-${idx}`;
    tdDev.textContent = '—';
    tr.appendChild(tdDev);

    tbody.appendChild(tr);
  });
}

/** Helper: create a number input element with accessibility attributes */
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

/**
 * For each row, compute the historical average of Day 1–5.
 * Returns the per-row average (null if no days entered).
 */
function calculateHistoricalAverage() {
  return state.rows.map(row => {
    const values = row.days.filter(v => v !== null && !isNaN(v));
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  });
}

/**
 * Calculate % deviation for each interval.
 * Deviation % = ((today - histAvg) / histAvg) * 100
 * Returns null when data is missing.
 */
function calculateDeviation(histAvgs) {
  return state.rows.map((row, idx) => {
    const hist = histAvgs[idx];
    const today = row.today;
    if (hist === null || today === null || hist === 0) return null;
    return ((today - hist) / hist) * 100;
  });
}

/**
 * Compute cumulative variance across intervals.
 * Returns running sum of absolute deviations.
 */
function calculateCumulativeVariance(deviations) {
  const cumulative = [];
  let running = 0;
  deviations.forEach(dev => {
    if (dev !== null) running += dev;
    cumulative.push(dev !== null ? running : null);
  });
  return cumulative;
}

/**
 * Find the interval with the largest positive spike.
 * Returns { interval, deviation } or null.
 */
function findLargestSpike(deviations) {
  let max = -Infinity;
  let spikeIdx = -1;
  deviations.forEach((dev, idx) => {
    if (dev !== null && dev > max) { max = dev; spikeIdx = idx; }
  });
  if (spikeIdx === -1) return null;
  return { interval: INTERVALS[spikeIdx], deviation: max };
}

/**
 * Find the interval with the largest negative dip.
 * Returns { interval, deviation } or null.
 */
function findLargestDip(deviations) {
  let min = Infinity;
  let dipIdx = -1;
  deviations.forEach((dev, idx) => {
    if (dev !== null && dev < min) { min = dev; dipIdx = idx; }
  });
  if (dipIdx === -1) return null;
  return { interval: INTERVALS[dipIdx], deviation: min };
}

/**
 * Calculate overall cumulative variance (mean of all valid deviations).
 */
function calculateOverallVariance(deviations) {
  const valid = deviations.filter(d => d !== null);
  if (valid.length === 0) return null;
  return valid.reduce((s, d) => s + d, 0) / valid.length;
}

/**
 * Compute period averages: Morning (8–11), Midday (11–14), Late-day (14–18).
 */
function calculatePeriodDeviations(deviations) {
  // Interval indices by period
  const periods = {
    morning:  { label: 'Morning (8:00–10:45)',  range: [0, 11]  },
    midday:   { label: 'Midday (11:00–13:45)',  range: [12, 23] },
    lateDay:  { label: 'Late-day (14:00–17:45)', range: [24, 39] },
  };

  const result = {};
  Object.entries(periods).forEach(([key, { label, range }]) => {
    const slice = deviations.slice(range[0], range[1] + 1).filter(d => d !== null);
    result[key] = {
      label,
      avg: slice.length ? slice.reduce((s, d) => s + d, 0) / slice.length : null,
    };
  });
  return result;
}

/* ============================================================
   5. PATTERN STATUS CLASSIFICATION
   ============================================================ */

/**
 * Classify pattern status based on absolute overall variance.
 * ±5%   → NORMAL
 * 5–10% → DRIFTING
 * >10%  → MAJOR DEVIATION
 */
function detectPatternStatus(overallVariance) {
  if (overallVariance === null) return { label: '—', level: 'unknown' };
  const abs = Math.abs(overallVariance);
  if (abs <= THRESHOLDS.normal) return { label: 'NORMAL', level: 'normal' };
  if (abs <= THRESHOLDS.drifting) return { label: 'DRIFTING', level: 'drifting' };
  return { label: 'MAJOR DEVIATION', level: 'major' };
}

/**
 * Classify service risk based on deviation magnitude.
 */
function classifyServiceRisk(overallVariance) {
  if (overallVariance === null) return { label: '—', level: 'unknown', message: '' };
  const abs = Math.abs(overallVariance);
  if (abs <= 5)  return { label: 'LOW',      level: 'low',      message: 'Staffing alignment is within acceptable tolerance.' };
  if (abs <= 10) return { label: 'MODERATE', level: 'moderate', message: 'Monitor for further pattern drift before adjusting.' };
  return              { label: 'HIGH',     level: 'high',     message: 'Arrival pattern deviation may impact staffing alignment.' };
}

/* ============================================================
   6. EXECUTIVE SUMMARY GENERATOR
   ============================================================ */

/**
 * Build the executive narrative text from analysis results.
 * Returns an array of line objects for structured display.
 */
function generateExecutiveSummary(analysis) {
  if (!analysis) return null;

  const { periods, spike, dip, overallVariance, status, risk } = analysis;

  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
  const lines = [];

  // Period summaries
  if (periods.morning.avg !== null)
    lines.push(`Morning period: ${describeDeviation(periods.morning.avg)} (${fmt(periods.morning.avg)})`);
  if (periods.midday.avg !== null)
    lines.push(`Midday period: ${describeDeviation(periods.midday.avg)} (${fmt(periods.midday.avg)})`);
  if (periods.lateDay.avg !== null)
    lines.push(`Late-day period: ${describeDeviation(periods.lateDay.avg)} (${fmt(periods.lateDay.avg)})`);

  // Spike / dip
  if (spike) lines.push(`Largest spike detected at ${spike.interval} (${fmt(spike.deviation)})`);
  if (dip)   lines.push(`Largest dip detected at ${dip.interval} (${fmt(dip.deviation)})`);

  // Overall
  if (overallVariance !== null)
    lines.push(`Cumulative variance: ${fmt(overallVariance)}`);

  // Interpretation
  const interpretation = buildInterpretation(analysis);
  const recommendation  = buildRecommendation(status);

  return { lines, interpretation, recommendation };
}

/** Plain-language description for a deviation percentage */
function describeDeviation(pct) {
  if (pct === null) return 'No data';
  const abs = Math.abs(pct);
  const dir = pct > 0 ? 'above' : 'below';
  if (abs <= 2) return 'Tracking at expected levels';
  if (abs <= 5) return `Slightly ${dir} historical average`;
  if (abs <= 10) return `Moderately ${dir} historical average`;
  return `Significantly ${dir} historical average`;
}

/** Narrative interpretation based on period deviations */
function buildInterpretation(analysis) {
  const { periods, overallVariance } = analysis;
  const morning  = periods.morning.avg;
  const lateDay  = periods.lateDay.avg;

  if (overallVariance === null) return 'Insufficient data for interpretation.';

  if (morning !== null && lateDay !== null) {
    if (morning < -3 && lateDay > 3)
      return "Today's arrival curve appears back-loaded — lower early volumes with higher-than-expected late-day traffic.";
    if (morning > 3 && lateDay < -3)
      return "Today's arrival curve appears front-loaded — higher early volumes with softer late-day traffic.";
  }

  if (Math.abs(overallVariance) <= 3)
    return "Today's arrival pattern is closely tracking historical norms across all periods.";
  if (overallVariance > 5)
    return "Overall volumes are running above historical averages — demand pressure is elevated.";
  if (overallVariance < -5)
    return "Overall volumes are running below historical averages — traffic is softer than expected.";

  return "Today's pattern shows minor deviations from historical norms. Continued monitoring recommended.";
}

/** Operational recommendation text based on pattern status */
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

/**
 * Derive the operational action recommendation.
 */
function generateOperationalInsight(status, risk) {
  const actions = [];

  switch (status.level) {
    case 'normal':
      actions.push({ type: 'green', icon: '✓', text: 'No action required — pattern within normal bounds.' });
      break;
    case 'drifting':
      actions.push({ type: 'yellow', icon: '⚠', text: 'Monitor upcoming intervals before adjusting staffing.' });
      actions.push({ type: 'yellow', icon: '↻', text: 'Prepare contingency reforecast if drift continues.' });
      break;
    case 'major':
      actions.push({ type: 'red', icon: '🔴', text: 'Consider intraday reforecast — significant deviation detected.' });
      actions.push({ type: 'red', icon: '👥', text: 'Review staffing alignment with operations lead.' });
      break;
    default:
      actions.push({ type: 'green', icon: '○', text: 'Awaiting data — enter volumes to generate insight.' });
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
    const cls  = p.avg === null ? 'cell-dev--neutral'
               : p.avg >  2    ? 'cell-dev--positive'
               : p.avg < -2    ? 'cell-dev--negative'
               : 'cell-dev--neutral';
    return `
      <div class="period-row">
        <span class="period-label">${p.label}</span>
        <span class="period-val ${cls}">${val}</span>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}

/* ============================================================
   9. SERVICE RISK SIGNAL
   ============================================================ */

/** Update the risk metric card with color and message */
function updateRiskCard(risk) {
  const card = document.getElementById('card-risk');
  const valEl = document.getElementById('riskValue');
  const tagEl = document.getElementById('riskTag');

  // Remove previous risk classes
  card.classList.remove('risk--low', 'risk--moderate', 'risk--high');

  valEl.textContent = risk.label;
  tagEl.textContent = risk.message || 'Risk level';

  if (risk.level === 'low')      card.classList.add('risk--low');
  if (risk.level === 'moderate') card.classList.add('risk--moderate');
  if (risk.level === 'high')     card.classList.add('risk--high');
}

/* ============================================================
   10. CHARTS
   ============================================================ */

/** Common Chart.js defaults for dark theme */
const chartDefaults = {
  color: '#8da3c2',
  font:  { family: "'DM Sans', sans-serif", size: 11 },
};

const gridColor  = 'rgba(99,179,237,0.06)';
const axisColor  = 'rgba(99,179,237,0.25)';

/**
 * Initialize all three chart canvases with empty data.
 * Called once on page load.
 */
function initCharts() {
  Chart.defaults.color      = chartDefaults.color;
  Chart.defaults.font.family = chartDefaults.font.family;
  Chart.defaults.font.size   = chartDefaults.font.size;

  const labels = INTERVALS;

  // 1. Arrival Curves (Line)
  charts.arrival = new Chart(document.getElementById('arrivalChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Historical Average',
          data: new Array(INTERVALS.length).fill(null),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#38bdf8',
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Today Actual',
          data: new Array(INTERVALS.length).fill(null),
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,0.06)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#a78bfa',
          borderDash: [5, 3],
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: buildLineOptions(),
  });

  // 2. Deviation Bar Chart
  charts.deviation = new Chart(document.getElementById('deviationChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Deviation %',
        data: new Array(INTERVALS.length).fill(null),
        backgroundColor: new Array(INTERVALS.length).fill('rgba(56,189,248,0.5)'),
        borderColor: new Array(INTERVALS.length).fill('#38bdf8'),
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: buildBarOptions(),
  });

  // 3. Cumulative Variance Line
  charts.cumulative = new Chart(document.getElementById('cumulativeChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative Variance %',
        data: new Array(INTERVALS.length).fill(null),
        borderColor: '#34d399',
        backgroundColor: 'rgba(52,211,153,0.07)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.4,
        fill: true,
      }],
    },
    options: buildLineOptions(true),
  });
}

/** Build shared line chart options */
function buildLineOptions(isCompact = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, padding: 16, color: '#8da3c2' } },
      tooltip: buildTooltipStyle(),
    },
    scales: {
      x: buildXScale(isCompact),
      y: buildYScale(),
    },
    animation: { duration: 600, easing: 'easeInOutQuart' },
  };
}

/** Build bar chart options */
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
        title: { display: true, text: 'Deviation %', color: '#4e6280', font: { size: 10 } },
      },
    },
    animation: { duration: 600 },
  };
}

function buildTooltipStyle() {
  return {
    backgroundColor: 'rgba(13,18,32,0.92)',
    borderColor: 'rgba(99,179,237,0.3)',
    borderWidth: 1,
    titleColor: '#e8f0fe',
    bodyColor: '#8da3c2',
    padding: 10,
    cornerRadius: 6,
  };
}

function buildXScale(compact = false) {
  return {
    ticks: {
      color: '#4e6280',
      maxRotation: 45,
      autoSkip: true,
      maxTicksLimit: compact ? 8 : 12,
      font: { size: 9 },
    },
    grid: { color: gridColor },
    border: { color: axisColor },
  };
}

function buildYScale() {
  return {
    ticks: { color: '#4e6280', font: { size: 10 } },
    grid: { color: gridColor },
    border: { color: axisColor },
  };
}

/**
 * Update chart data after recalculation.
 * Colors deviation bars by sign (red = above, green = below).
 */
function updateCharts(histAvgs, deviations, cumulative) {
  // Arrival curves
  charts.arrival.data.datasets[0].data = histAvgs.map(v => v !== null ? +v.toFixed(1) : null);
  charts.arrival.data.datasets[1].data = state.rows.map(r => r.today);
  charts.arrival.update('active');

  // Deviation bars — color by sign
  const devData    = deviations.map(d => d !== null ? +d.toFixed(2) : null);
  const barColors  = devData.map(d => d === null ? 'rgba(99,102,241,0.3)' : d > 0 ? 'rgba(248,113,113,0.55)' : 'rgba(52,211,153,0.55)');
  const borderCols = devData.map(d => d === null ? '#6366f1' : d > 0 ? '#f87171' : '#34d399');

  charts.deviation.data.datasets[0].data = devData;
  charts.deviation.data.datasets[0].backgroundColor = barColors;
  charts.deviation.data.datasets[0].borderColor = borderCols;
  charts.deviation.update('active');

  // Cumulative variance
  charts.cumulative.data.datasets[0].data = cumulative.map(v => v !== null ? +v.toFixed(2) : null);
  charts.cumulative.update('active');
}

/* ============================================================
   11. EMAIL / EXPORT
   ============================================================ */

/**
 * Build the full plain-text summary for export.
 */
function buildPlainTextSummary(analysis) {
  if (!analysis) return 'No analysis data available. Please enter data first.';

  const { summary, status, risk, overallVariance, spike, dip, periods } = analysis;
  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
  const now = new Date().toLocaleString();

  let text = `INTRADAY PATTERN ANALYSIS\n`;
  text += `Generated: ${now}\n`;
  text += `${'─'.repeat(50)}\n\n`;

  text += `PATTERN STATUS: ${status.label}\n`;
  text += `CUMULATIVE VARIANCE: ${fmt(overallVariance)}\n`;
  text += `SERVICE RISK SIGNAL: ${risk.label}\n\n`;

  text += `PERIOD SUMMARY\n`;
  text += `${'─'.repeat(30)}\n`;
  Object.values(periods).forEach(p => {
    text += `${p.label}: ${fmt(p.avg)}\n`;
  });

  if (spike) text += `\nLargest Spike: ${spike.interval} (${fmt(spike.deviation)})\n`;
  if (dip)   text += `Largest Dip:   ${dip.interval} (${fmt(dip.deviation)})\n`;

  if (summary) {
    text += `\nNARRATIVE LINES\n${'─'.repeat(30)}\n`;
    summary.lines.forEach(l => { text += `• ${l}\n`; });
    text += `\nINTERPRETATION\n${summary.interpretation}\n`;
    text += `\nRECOMMENDATION\n${summary.recommendation}\n`;
  }

  text += `\n${'─'.repeat(50)}\n`;
  text += `Intraday Pattern Deviation Analyzer | Workforce Intelligence Suite\n`;
  text += `Built by Abdul Basit\n`;

  return text;
}

/** Generate email via mailto and open handler */
function generateEmailLink(subject, body) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Open Outlook (generic mailto) */
function exportEmailOutlook() {
  const body = buildPlainTextSummary(state.analysis);
  const subject = 'Intraday Pattern Analysis – Volume Pattern Update';
  window.location.href = generateEmailLink(subject, body);
}

/** Open Gmail compose */
function exportEmailGmail() {
  const body = buildPlainTextSummary(state.analysis);
  const subject = 'Intraday Pattern Analysis – Volume Pattern Update';
  const url = `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(url, '_blank');
}

/** Copy summary to clipboard */
async function copySummary() {
  const text = buildPlainTextSummary(state.analysis);
  try {
    await navigator.clipboard.writeText(text);
    showToast('Summary copied to clipboard');
  } catch {
    // Fallback for non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Summary copied to clipboard');
  }
}

/** Download report as .txt file */
function downloadReport() {
  const text = buildPlainTextSummary(state.analysis);
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `intraday-analysis-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report downloaded');
}

/* ============================================================
   12. UI UPDATE ORCHESTRATOR
   ============================================================ */

/**
 * Main recalculation pipeline — called on every data change.
 * Runs all calculations and updates all UI components.
 */
function onDataChange() {
  // Step 1: Calculate historical averages
  const histAvgs = calculateHistoricalAverage();

  // Step 2: Update hist-avg cells in table
  histAvgs.forEach((avg, idx) => {
    const cell = document.getElementById(`hist-${idx}`);
    if (cell) cell.textContent = avg !== null ? avg.toFixed(1) : '—';
  });

  // Step 3: Calculate deviations
  const deviations = calculateDeviation(histAvgs);

  // Step 4: Update deviation cells in table with color coding
  deviations.forEach((dev, idx) => {
    const cell = document.getElementById(`dev-${idx}`);
    if (!cell) return;
    if (dev === null) {
      cell.textContent = '—';
      cell.className = 'cell-dev cell-dev--neutral';
      return;
    }
    cell.textContent = `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%`;
    cell.className = `cell-dev ${dev > 2 ? 'cell-dev--positive' : dev < -2 ? 'cell-dev--negative' : 'cell-dev--neutral'}`;
  });

  // Step 5: Derived metrics
  const cumulative     = calculateCumulativeVariance(deviations);
  const overallVariance = calculateOverallVariance(deviations);
  const spike          = findLargestSpike(deviations);
  const dip            = findLargestDip(deviations);
  const periods        = calculatePeriodDeviations(deviations);
  const status         = detectPatternStatus(overallVariance);
  const risk           = classifyServiceRisk(overallVariance);
  const summary        = generateExecutiveSummary({ periods, spike, dip, overallVariance, status, risk });

  // Step 6: Cache analysis
  state.analysis = { histAvgs, deviations, cumulative, overallVariance, spike, dip, periods, status, risk, summary };

  // Step 7: Update metric cards
  updateMetricCards(state.analysis);

  // Step 8: Render executive narrative
  renderExecutiveNarrative(summary);

  // Step 9: Render operational insight
  renderOperationalInsight(status, risk);

  // Step 10: Render period breakdown
  renderPeriodBreakdown(periods);

  // Step 11: Update service risk card
  updateRiskCard(risk);

  // Step 12: Update charts
  updateCharts(histAvgs, deviations, cumulative);

  // Step 13: Update export preview
  updateExportPreview(state.analysis);
}

/** Update the five metric summary cards */
function updateMetricCards(analysis) {
  const { overallVariance, spike, dip, status } = analysis;
  const fmt = v => v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

  // Status card
  const statusCard = document.getElementById('card-status');
  statusCard.classList.remove('status--normal', 'status--drifting', 'status--major');
  animateValue('statusValue', status.label);
  const statusTag = document.getElementById('statusTag');
  statusTag.textContent = overallVariance !== null ? `Avg deviation: ${fmt(overallVariance)}` : 'Awaiting data';
  if (status.level !== 'unknown') statusCard.classList.add(`status--${status.level}`);

  // Cumulative variance card
  animateValue('cumulativeValue', fmt(overallVariance));

  // Spike card
  if (spike) {
    animateValue('spikeValue', fmt(spike.deviation));
    document.getElementById('spikeInterval').textContent = `Interval ${spike.interval}`;
  } else {
    document.getElementById('spikeValue').textContent = '—';
    document.getElementById('spikeInterval').textContent = 'Interval —';
  }

  // Dip card
  if (dip) {
    animateValue('dipValue', fmt(dip.deviation));
    document.getElementById('dipInterval').textContent = `Interval ${dip.interval}`;
  } else {
    document.getElementById('dipValue').textContent = '—';
    document.getElementById('dipInterval').textContent = 'Interval —';
  }
}

/** Render the executive narrative panel */
function renderExecutiveNarrative(summary) {
  const container = document.getElementById('executiveNarrative');
  if (!summary) {
    container.innerHTML = '<p class="panel__placeholder">Load data or enter values to generate the executive summary.</p>';
    return;
  }

  const lineHtml = summary.lines.map(line =>
    `<div class="narrative-line"><div class="narrative-bullet"></div><div>${line}</div></div>`
  ).join('');

  container.innerHTML = `
    ${lineHtml}
    <div class="narrative-section-title">Interpretation</div>
    <div class="narrative-line"><div class="narrative-bullet" style="background:#6366f1"></div><div>${summary.interpretation}</div></div>
    <div class="narrative-section-title">Recommendation</div>
    <div class="narrative-line"><div class="narrative-bullet" style="background:#34d399"></div><div>${summary.recommendation}</div></div>
  `;
}

/** Render the operational insight panel */
function renderOperationalInsight(status, risk) {
  const container = document.getElementById('operationalInsight');
  const actions   = generateOperationalInsight(status, risk);

  container.innerHTML = actions.map(a =>
    `<div class="insight-action insight-action--${a.type}">
       <span>${a.icon}</span>
       <span>${a.text}</span>
     </div>`
  ).join('');
}

/** Update the export preview pane */
function updateExportPreview(analysis) {
  const el = document.getElementById('exportPreview');
  el.textContent = buildPlainTextSummary(analysis);
}

/* ============================================================
   13. MICRO-INTERACTIONS
   ============================================================ */

/**
 * Animate a numeric metric value by counting up/changing.
 * For text values (NORMAL, DRIFTING…), just sets immediately.
 */
function animateValue(elementId, targetText) {
  const el = document.getElementById(elementId);
  if (!el) return;
  // For non-numeric targets, just update with fade
  el.style.opacity = '0.4';
  el.style.transform = 'scale(0.92)';
  setTimeout(() => {
    el.textContent = targetText;
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    el.style.opacity = '1';
    el.style.transform = 'scale(1)';
  }, 100);
}

/** Show a toast notification */
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
   14.A EXAMPLE DATA LOADER
   ============================================================ */

/**
 * Populate table inputs with realistic contact center data.
 * Pattern: normal bell-curve history, slightly back-loaded today.
 */
function loadExampleData() {
  // Historical day volumes — normal bell-curve peaking midday
  const histBase = [
    // 8:00 – 8:45 (rising early)
    18, 24, 30, 38,
    // 9:00 – 9:45 (building)
    52, 65, 78, 88,
    // 10:00 – 10:45 (approaching peak)
    96, 102, 108, 114,
    // 11:00 – 11:45 (peak)
    118, 122, 125, 122,
    // 12:00 – 12:45 (midday plateau)
    112, 105, 98, 92,
    // 13:00 – 13:45 (early afternoon dip)
    88, 85, 82, 80,
    // 14:00 – 14:45 (afternoon build)
    84, 89, 94, 98,
    // 15:00 – 15:45 (secondary peak)
    102, 104, 106, 102,
    // 16:00 – 16:45 (declining)
    94, 84, 72, 60,
    // 17:00 – 17:45 (end of day)
    48, 36, 26, 18,
  ];

  // Variance multipliers for each of 5 days (±8%)
  const dayVariance = [
    [0.97, 1.04, 0.98, 1.02, 1.06],
    [1.05, 0.96, 1.03, 0.98, 1.00],
    [0.99, 1.02, 0.97, 1.04, 0.95],
    [1.03, 0.99, 1.05, 0.97, 1.02],
    [0.96, 1.07, 1.01, 0.99, 1.04],
    [1.02, 0.98, 0.96, 1.05, 1.01],
    [0.98, 1.03, 1.02, 0.97, 1.06],
    [1.04, 0.97, 1.00, 1.02, 0.98],
    [1.01, 1.05, 0.98, 0.96, 1.03],
    [0.97, 1.02, 1.04, 1.01, 0.99],
    [1.06, 0.96, 1.01, 1.03, 0.98],
    [1.00, 1.04, 0.97, 0.99, 1.05],
    [0.98, 1.01, 1.03, 1.04, 0.96],
    [1.03, 0.98, 1.00, 0.97, 1.04],
    [1.01, 1.05, 0.96, 1.02, 0.99],
    [0.97, 1.00, 1.04, 1.01, 1.03],
    [1.04, 0.98, 1.01, 0.96, 1.02],
    [0.99, 1.03, 0.97, 1.05, 1.01],
    [1.02, 0.96, 1.04, 0.99, 1.00],
    [1.05, 1.01, 0.98, 1.03, 0.97],
    [0.98, 1.04, 1.02, 0.96, 1.03],
    [1.03, 0.97, 1.05, 1.01, 0.99],
    [1.00, 1.02, 0.96, 1.04, 1.03],
    [0.97, 1.05, 1.01, 0.98, 1.02],
    [1.04, 0.99, 1.03, 1.00, 0.97],
    [1.01, 1.03, 0.97, 1.05, 1.00],
    [0.98, 1.01, 1.04, 0.97, 1.03],
    [1.03, 0.96, 1.00, 1.02, 1.05],
    [1.00, 1.04, 0.99, 0.96, 1.02],
    [0.97, 1.02, 1.03, 1.04, 0.99],
    [1.05, 0.98, 1.01, 0.97, 1.03],
    [1.02, 1.03, 0.96, 1.01, 1.00],
    [0.99, 1.00, 1.04, 1.03, 0.96],
    [1.03, 0.97, 0.99, 1.05, 1.02],
    [1.01, 1.04, 0.97, 0.98, 1.03],
    [0.96, 1.02, 1.03, 1.01, 1.04],
    [1.04, 0.99, 1.02, 0.96, 1.01],
    [0.98, 1.03, 1.00, 1.04, 0.97],
    [1.02, 0.96, 1.04, 0.99, 1.03],
    [1.00, 1.01, 0.97, 1.02, 1.05],
  ];

  // Today — back-loaded: lower morning, higher afternoon
  const todayShift = [
    // 8:00 – 9:45 (lower morning)
    -0.12, -0.10, -0.09, -0.08, -0.07, -0.06, -0.05, -0.04,
    // 10:00 – 11:45 (near normal)
    -0.02, -0.01, 0.01, 0.02, 0.02, 0.03, 0.03, 0.02,
    // 12:00 – 13:45 (slight dip)
    -0.02, -0.03, -0.02, -0.01, 0.01, 0.02, 0.03, 0.04,
    // 14:00 – 15:45 (building afternoon surge)
    0.05, 0.07, 0.09, 0.10, 0.11, 0.12, 0.10, 0.09,
    // 16:00 – 17:45 (elevated close)
    0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01,
  ];

  // Write values into state and inputs
  INTERVALS.forEach((interval, idx) => {
    const row   = state.rows[idx];
    const base  = histBase[idx];
    const shift = todayShift[idx] || 0;

    // Set day values
    for (let d = 0; d < 5; d++) {
      const mult = dayVariance[idx] ? dayVariance[idx][d] : 1;
      const val  = Math.round(base * mult);
      row.days[d] = val;
      const input = document.getElementById(`day-${idx}-${d}`);
      if (input) input.value = val;
    }

    // Set today value
    const todayVal = Math.round(base * (1 + shift));
    row.today = todayVal;
    const todayInput = document.getElementById(`today-${idx}`);
    if (todayInput) todayInput.value = todayVal;
  });

  // Trigger full recalculation
  onDataChange();
  showToast('Example data loaded');
}

/** Clear all input fields and reset state */
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
  });

  state.analysis = null;
  onDataChange();
  showToast('Data cleared');
}

/* ============================================================
   14.B EVENT LISTENERS & INITIALISATION
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Build table rows
  buildTable();

  // Initialise charts
  initCharts();

  // Trigger initial (empty) render
  onDataChange();

  // Hero buttons
  document.getElementById('loadExampleBtn').addEventListener('click', loadExampleData);
  document.getElementById('clearDataBtn').addEventListener('click', clearData);

  // Export buttons
  document.getElementById('outlookBtn').addEventListener('click', exportEmailOutlook);
  document.getElementById('gmailBtn').addEventListener('click', exportEmailGmail);
  document.getElementById('copyBtn').addEventListener('click', copySummary);
  document.getElementById('downloadBtn').addEventListener('click', downloadReport);

  // Mobile nav toggle
  const menuToggle = document.getElementById('menuToggle');
  const navLinks   = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', navLinks.classList.contains('is-open'));
    });
  }
});
