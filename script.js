/**
 * INTRADAY INTELLIGENCE DASHBOARD — script.js
 * Author: Abdul Basit | Workforce Intelligence Suite
 *
 * Features:
 *  1. 61 intervals (8:00–23:00)
 *  2. Week −1 to −5 column naming
 *  3. Bulk vertical paste per column
 *  4. Excel Ctrl+V tab-separated paste
 *  5. Arrival Pattern % calculation
 *  6. Historical Projection (Daily Forecast × Arrival %)
 *  7. Run-Rate Projection (Actual ÷ Expected Arrival %)
 *  8. Blended Forecast (weighted early/mid/late)
 *  9. Deviation % with green/yellow/red coding
 * 10. Confidence Score (High/Medium/Low)
 * 11. Backlog Risk (Safe/Risk/Critical)
 * 12. Operational Insights panel
 * 13. Charts: Forecast vs Actual, Arrival Pattern, Deviation
 * 14. Debounced recalculation, performance optimised
 */

/* ============================================================
   1. INTERVALS
   ============================================================ */
function genIntervals(startH, endH) {
  const out = [];
  for (let h = startH; h <= endH; h++) {
    const mins = (h === endH) ? [0] : [0, 15, 30, 45];
    mins.forEach(m => out.push(`${h}:${String(m).padStart(2,'0')}`));
  }
  return out;
}
const INTERVALS = genIntervals(8, 23); // 61 intervals
const N = INTERVALS.length;

/* ============================================================
   2. STATE
   ============================================================ */
const state = {
  rows: [],       // [{days:[n,n,n,n,n], today:n}]
  analysis: null,
  dailyForecast: null,
  availableCapacity: null,
};

/* ============================================================
   3. BUILD TABLE
   ============================================================ */
function buildTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  state.rows = [];

  INTERVALS.forEach((interval, i) => {
    const row = { days: [null,null,null,null,null], today: null };
    state.rows.push(row);

    const tr = document.createElement('tr');
    tr.dataset.i = i;

    // Interval label (sticky)
    const tdLabel = document.createElement('td');
    tdLabel.className = 'td-sticky';
    tdLabel.textContent = interval;
    tr.appendChild(tdLabel);

    // Week −1 to −5 inputs
    for (let d = 0; d < 5; d++) {
      const td = document.createElement('td');
      td.className = 'td-week';
      const inp = makeNumInput(`w${d}-${i}`, `Week -${d+1} at ${interval}`);
      inp.addEventListener('input', () => { row.days[d] = parseFloat(inp.value)||null; scheduleRecalc(); });
      td.appendChild(inp);
      tr.appendChild(td);
    }

    // Hist Avg (computed)
    addComputedTd(tr, `ha-${i}`, 'td-hist');
    // Arrival % (computed)
    addComputedTd(tr, `arr-${i}`, 'td-arrival');
    // Today input
    const tdToday = document.createElement('td');
    tdToday.className = 'td-today';
    const todayInp = makeNumInput(`t-${i}`, `Today at ${interval}`);
    todayInp.addEventListener('input', () => { row.today = parseFloat(todayInp.value)||null; scheduleRecalc(); });
    tdToday.appendChild(todayInp);
    tr.appendChild(tdToday);
    // Deviation %
    addComputedTd(tr, `dev-${i}`, '');
    // Completion %
    addComputedTd(tr, `cmpl-${i}`, 'td-cmpl');
    // Hist Projection
    addComputedTd(tr, `hp-${i}`, 'td-histp');
    // Run-Rate
    addComputedTd(tr, `rr-${i}`, 'td-rr');
    // Blended
    addComputedTd(tr, `bl-${i}`, 'td-blended');
    // Confidence
    addComputedTd(tr, `cf-${i}`, '');
    // Remaining
    addComputedTd(tr, `rem-${i}`, 'td-remaining');
    // Backlog
    addComputedTd(tr, `blg-${i}`, '');

    tbody.appendChild(tr);
  });
}

function makeNumInput(id, label) {
  const inp = document.createElement('input');
  inp.type = 'number'; inp.id = id; inp.min = '0'; inp.step = '1';
  inp.setAttribute('aria-label', label);
  return inp;
}

function addComputedTd(tr, id, cls) {
  const td = document.createElement('td');
  td.id = id;
  if (cls) td.className = cls;
  td.textContent = '—';
  tr.appendChild(td);
  return td;
}

/* ============================================================
   4. CORE CALCULATIONS
   ============================================================ */

function calcHistAvg() {
  return state.rows.map(row => {
    const vals = row.days.filter(v => v !== null);
    return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : null;
  });
}

/** Arrival Pattern %: per-week pattern averaged across weeks */
function calcArrivalPattern(histAvgs) {
  // Use histAvgs for the averaged pattern
  const total = histAvgs.reduce((s,v)=>s+(v||0),0);
  if (total === 0) return new Array(N).fill(null);
  return histAvgs.map(v => v !== null ? v/total : null);
}

/** Hist completion % = cumulative hist / total hist */
function calcHistCompletion(histAvgs) {
  const total = histAvgs.reduce((s,v)=>s+(v||0),0);
  if (total === 0) return new Array(N).fill(null);
  let cum = 0;
  return histAvgs.map(v => { cum += (v||0); return total > 0 ? cum/total : null; });
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
  return histAvgs.map(v => { cum += (v||0); return v !== null ? cum : null; });
}

/**
 * Historical Projection model:
 * Projected Calls = Daily Forecast × Arrival Pattern %
 * (returns projected interval-level expected calls, not EOD total)
 * For the EOD total: if dailyForecast set, use it; else infer from run-rate.
 */
function calcHistProj(arrivalPct, dailyForecast) {
  if (!dailyForecast) return new Array(N).fill(null);
  return arrivalPct.map(a => a !== null ? dailyForecast * a : null);
}

/**
 * Run-Rate Projection at each interval:
 * EOD estimate = CumActual / (dayCompletionPct)
 * dayCompletionPct = cumHistCompletion at that interval
 */
function calcRunRate(cumActual, histCompletion) {
  return cumActual.map((cum, i) => {
    const comp = histCompletion[i];
    if (cum === null || !comp || comp === 0) return null;
    return cum / comp;
  });
}

/**
 * Blended Forecast:
 * <25% day done  → 70% Hist + 30% RunRate
 * 25–60%         → 50% Hist + 50% RunRate
 * >60%           → 30% Hist + 70% RunRate
 * Both must be available.
 */
function calcBlended(histProj, runRate, histCompletion, dailyForecast) {
  return histProj.map((hp, i) => {
    const rr = runRate[i];
    // hp here is interval-level from dailyForecast model
    // For blended EOD we blend EOD estimates
    const histEOD = dailyForecast || null;
    const rrEOD = rr;
    if (rrEOD === null) return null;

    const comp = histCompletion[i] || 0;
    let wHist, wRR;
    if (comp < 0.25)      { wHist = 0.7; wRR = 0.3; }
    else if (comp < 0.60) { wHist = 0.5; wRR = 0.5; }
    else                   { wHist = 0.3; wRR = 0.7; }

    if (histEOD !== null) return wHist * histEOD + wRR * rrEOD;
    return rrEOD; // fallback to pure run-rate
  });
}

function calcRemaining(blended, cumActual) {
  return blended.map((b, i) => {
    if (b === null || cumActual[i] === null) return null;
    return Math.max(0, Math.round(b - cumActual[i]));
  });
}

/**
 * Confidence Score:
 * Based on deviation magnitude, run-rate stability, day completion
 */
function calcConfidence(deviations, histCompletion, blended, dailyForecast) {
  return deviations.map((dev, i) => {
    if (dev === null) return null;
    const comp = histCompletion[i] || 0;
    const absD = Math.abs(dev);

    // Base score out of 100
    let score = 100;
    if (absD > 10) score -= 40;
    else if (absD > 5) score -= 20;

    // More confident as day progresses
    if (comp < 0.25) score -= 20;
    else if (comp < 0.5) score -= 10;

    // Blended vs daily forecast alignment
    const b = blended[i];
    if (b !== null && dailyForecast) {
      const diff = Math.abs((b - dailyForecast) / dailyForecast) * 100;
      if (diff > 10) score -= 15;
      else if (diff > 5) score -= 8;
    }

    if (score >= 70) return { level: 'high',   label: 'High' };
    if (score >= 45) return { level: 'med',    label: 'Medium' };
    return                  { level: 'low',    label: 'Low' };
  });
}

/**
 * Backlog Risk = Remaining Calls − Available Capacity (remaining proportional)
 * Safe < 0, Risk 0–10%, Critical > 10% over capacity
 */
function calcBacklog(remaining, histCompletion, availCap) {
  return remaining.map((rem, i) => {
    if (rem === null) return null;
    if (!availCap) return { status: 'safe', label: 'Safe' };

    // Remaining capacity scales with remaining day
    const comp = histCompletion[i] || 0;
    const remCapacity = availCap * (1 - comp);
    const diff = rem - remCapacity;

    if (diff <= 0) return { status: 'safe', label: 'Safe' };
    if (diff / remCapacity <= 0.10) return { status: 'risk', label: 'Risk' };
    return { status: 'critical', label: 'Critical' };
  });
}

function calcOverallVariance(devs) {
  const valid = devs.filter(d=>d!==null);
  return valid.length ? valid.reduce((s,d)=>s+d,0)/valid.length : null;
}

function findSpike(devs) {
  let max=-Infinity, idx=-1;
  devs.forEach((d,i)=>{ if(d!==null&&d>max){max=d;idx=i;} });
  return idx===-1?null:{interval:INTERVALS[idx],deviation:max};
}
function findDip(devs) {
  let min=Infinity, idx=-1;
  devs.forEach((d,i)=>{ if(d!==null&&d<min){min=d;idx=i;} });
  return idx===-1?null:{interval:INTERVALS[idx],deviation:min};
}

function calcPeriods(devs) {
  const defs = {
    morning:   {label:'Morning (8:00–10:45)',   r:[0,11]},
    midday:    {label:'Midday (11:00–13:45)',   r:[12,23]},
    afternoon: {label:'Afternoon (14:00–17:45)',r:[24,39]},
    evening:   {label:'Evening (18:00–23:00)',  r:[40,60]},
  };
  const out={};
  Object.entries(defs).forEach(([k,{label,r}])=>{
    const slice=devs.slice(r[0],r[1]+1).filter(d=>d!==null);
    out[k]={label,avg:slice.length?slice.reduce((s,d)=>s+d,0)/slice.length:null};
  });
  return out;
}

function detectPattern(periods) {
  const m=periods.morning.avg, a=periods.afternoon.avg, e=periods.evening?.avg;
  if(m===null&&a===null) return{label:'—',cls:''};
  if(m!==null&&a!==null){
    if(m>5&&a<-2) return{label:'Front-Loaded',cls:'tp-front'};
    if(m<-5&&a>2) return{label:'Delayed Peak',cls:'tp-delayed'};
  }
  if(e!==null&&e>8) return{label:'Evening Surge',cls:'tp-surge'};
  const all=[m,a,e].filter(v=>v!==null);
  const mx=all.length?Math.max(...all.map(Math.abs)):0;
  if(mx<=5) return{label:'Normal Pattern',cls:'tp-normal'};
  return{label:'Normal Pattern',cls:'tp-normal'};
}

function detectStatus(ov) {
  if(ov===null) return{label:'—',cls:''};
  const a=Math.abs(ov);
  if(a<=5)  return{label:'NORMAL',cls:'card-normal'};
  if(a<=10) return{label:'DRIFTING',cls:'card-drifting'};
  return      {label:'MAJOR DEVIATION',cls:'card-major'};
}
function detectRisk(ov) {
  if(ov===null) return{label:'—',cls:'',msg:''};
  const a=Math.abs(ov);
  if(a<=5)  return{label:'LOW',cls:'risk-low',msg:'Staffing alignment within acceptable tolerance.'};
  if(a<=10) return{label:'MODERATE',cls:'risk-moderate',msg:'Monitor before adjusting staffing.'};
  return      {label:'HIGH',cls:'risk-high',msg:'Pattern deviation may impact staffing alignment.'};
}

/* ============================================================
   5. UPDATE TABLE CELLS (batch DOM writes)
   ============================================================ */
function updateCells(histAvgs, arrivalPct, histCompletion, devs, histProj,
                     runRate, blended, confidence, remaining, backlog) {
  const fmtN = v => v!==null?v.toFixed(1):'—';
  const fmtI = v => v!==null?Math.round(v).toLocaleString():'—';
  const fmtP = v => v!==null?(v*100).toFixed(1)+'%':'—';

  for (let i=0;i<N;i++) {
    // Hist avg
    setText(`ha-${i}`, fmtN(histAvgs[i]));
    // Arrival %
    setText(`arr-${i}`, fmtP(arrivalPct[i]));
    // Completion %
    setText(`cmpl-${i}`, fmtP(histCompletion[i]));
    // Hist proj (interval expected = dailyForecast * arrivalPct)
    setText(`hp-${i}`, fmtI(histProj[i]));
    // Run-rate EOD projection
    setText(`rr-${i}`, fmtI(runRate[i]));
    // Blended EOD
    setText(`bl-${i}`, fmtI(blended[i]));
    // Remaining
    setText(`rem-${i}`, remaining[i]!==null?remaining[i].toLocaleString():'—');

    // Deviation badge
    const devEl=document.getElementById(`dev-${i}`);
    if(devEl){
      const d=devs[i];
      if(d===null){devEl.innerHTML='<span class="dev-neutral">—</span>';}
      else{
        const abs=Math.abs(d);
        const cls=abs<=5?'dev-green':abs<=10?'dev-yellow':'dev-red';
        devEl.innerHTML=`<span class="dev-badge ${cls}">${d>0?'+':''}${d.toFixed(1)}%</span>`;
      }
    }

    // Confidence badge
    const cfEl=document.getElementById(`cf-${i}`);
    if(cfEl){
      const c=confidence[i];
      if(!c){cfEl.textContent='—';}
      else{
        cfEl.innerHTML=`<span class="conf-badge conf-${c.level}"><span class="conf-dot"></span>${c.label}</span>`;
      }
    }

    // Backlog badge
    const blgEl=document.getElementById(`blg-${i}`);
    if(blgEl){
      const b=backlog[i];
      if(!b){blgEl.textContent='—';}
      else{
        const cls=b.status==='safe'?'bl-safe':b.status==='risk'?'bl-risk':'bl-critical';
        blgEl.innerHTML=`<span class="bl-badge ${cls}">${b.label}</span>`;
      }
    }
  }
}

function setText(id, val) {
  const el=document.getElementById(id);
  if(el) el.textContent=val;
}

/* ============================================================
   6. KPI STRIP + METRIC CARDS
   ============================================================ */
function updateKPIs(data) {
  const {cumActual,cumHist,runRate,blended,histCompletion,overallVariance,
         trafficPattern,status,risk,confidence,backlog,remaining} = data;

  // Find last valid index
  let lastI=-1;
  for(let i=N-1;i>=0;i--){ if(cumActual[i]!==null){lastI=i;break;} }

  const fmt=v=>v!==null?Math.round(v).toLocaleString():'—';
  const fmtPct=v=>v!==null?`${v>0?'+':''}${v.toFixed(1)}%`:'—';

  // Traffic pattern
  const tpEl=document.getElementById('trafficPattern');
  if(tpEl) tpEl.innerHTML=trafficPattern.label!=='—'
    ?`<span class="${trafficPattern.cls}">${trafficPattern.label}</span>`:'—';

  setText('siCumActual', lastI>=0?fmt(cumActual[lastI]):'—');
  const expNow=lastI>=0?cumHist[lastI]:null;
  setText('siCumExpected', fmt(expNow));

  // Variance %
  const varPct=(expNow&&expNow>0&&lastI>=0&&cumActual[lastI]!==null)
    ?((cumActual[lastI]-expNow)/expNow)*100:null;
  const varEl=document.getElementById('siVariancePct');
  if(varEl){
    varEl.textContent=fmtPct(varPct);
    varEl.style.color=varPct===null?''
      :Math.abs(varPct)<=5?'var(--green-600)'
      :Math.abs(varPct)<=10?'var(--yellow-600)':'var(--red-600)';
  }

  // Hist Proj (latest)
  let latHP=null; for(let i=N-1;i>=0;i--){if(runRate[i]!==null){latHP=runRate[i];break;}}
  setText('siHistProj', fmt(latHP));
  setText('siRunRate', fmt(latHP));

  // Blended (latest)
  let latBl=null; for(let i=N-1;i>=0;i--){if(blended[i]!==null){latBl=blended[i];break;}}
  setText('siBlended', fmt(latBl));

  // Confidence (latest)
  let latCf=null; for(let i=N-1;i>=0;i--){if(confidence[i]!==null){latCf=confidence[i];break;}}
  const cfEl=document.getElementById('siConfidence');
  if(cfEl){
    if(latCf){
      cfEl.textContent=latCf.label;
      cfEl.style.color=latCf.level==='high'?'var(--green-600)'
        :latCf.level==='med'?'var(--yellow-600)':'var(--red-600)';
    } else { cfEl.textContent='—'; cfEl.style.color=''; }
  }

  // Backlog (latest)
  let latBl2=null; for(let i=N-1;i>=0;i--){if(backlog[i]!==null){latBl2=backlog[i];break;}}
  const blEl=document.getElementById('siBacklog');
  if(blEl){
    if(latBl2){
      blEl.textContent=latBl2.label;
      blEl.style.color=latBl2.status==='safe'?'var(--green-600)'
        :latBl2.status==='risk'?'var(--yellow-600)':'var(--red-600)';
    } else { blEl.textContent='—'; blEl.style.color=''; }
  }

  // Metric cards
  // Status card
  const sCd=document.getElementById('card-status');
  sCd.classList.remove('card-normal','card-drifting','card-major');
  if(status.cls) sCd.classList.add(status.cls);
  animVal('statusValue', status.label);
  setText('statusTag', overallVariance!==null?`Avg: ${fmtPct(overallVariance)}`:'Awaiting data');

  animVal('cumulativeValue', fmtPct(overallVariance));

  // Blended card
  animVal('blendedValue', fmt(latBl));
  setText('blendedTag', latBl?`EOD estimate`:'Enter today data');

  // Risk card
  const rCd=document.getElementById('card-risk');
  rCd.classList.remove('risk-low','risk-moderate','risk-high');
  if(risk.cls) rCd.classList.add(risk.cls);
  animVal('riskValue', risk.label);
  setText('riskTag', risk.msg||'Risk level');

  // Backlog card
  const bCd=document.getElementById('card-backlog');
  bCd.classList.remove('bl-safe-card','bl-risk-card','bl-critical-card');
  if(latBl2){
    const bcls=latBl2.status==='safe'?'bl-safe-card':latBl2.status==='risk'?'bl-risk-card':'bl-critical-card';
    bCd.classList.add(bcls);
    animVal('backlogValue', latBl2.label);
    setText('backlogTag', 'Capacity alignment');
  } else {
    animVal('backlogValue','—');
    setText('backlogTag','Set capacity above');
  }
}

function animVal(id, txt) {
  const el=document.getElementById(id);
  if(!el) return;
  el.style.opacity='.4';
  el.style.transform='scale(.94)';
  requestAnimationFrame(()=>{
    el.textContent=txt;
    el.style.transition='opacity .2s ease,transform .2s ease';
    el.style.opacity='1';
    el.style.transform='scale(1)';
  });
}

/* ============================================================
   7. OPERATIONAL INSIGHTS
   ============================================================ */
function buildInsights(data) {
  const {overallVariance,trafficPattern,runRate,blended,periods,spike,dip,risk,
         backlog,cumActual,histCompletion,dailyForecast} = data;
  const items=[];

  if(overallVariance===null){ return [{cls:'ins-blue',icon:'ℹ️',msg:'Enter data to generate operational insights.'}]; }

  const lastI=runRate.reduce((best,v,i)=>v!==null?i:best,-1);
  const latRR=lastI>=0?runRate[lastI]:null;

  // Volume level
  if(overallVariance>10)
    items.push({cls:'ins-red',icon:'🔴',msg:`Volume currently running ${overallVariance.toFixed(1)}% above historical expectation.`});
  else if(overallVariance>5)
    items.push({cls:'ins-yellow',icon:'⚠️',msg:`Traffic moderately above forecast (+${overallVariance.toFixed(1)}%). Monitor closely.`});
  else if(overallVariance<-10)
    items.push({cls:'ins-yellow',icon:'📉',msg:`Volume ${Math.abs(overallVariance).toFixed(1)}% below historical — staffing surplus possible.`});
  else if(overallVariance<-5)
    items.push({cls:'ins-blue',icon:'📊',msg:`Traffic slightly below forecast (${overallVariance.toFixed(1)}%). Within acceptable range.`});
  else
    items.push({cls:'ins-green',icon:'✅',msg:`Volume tracking within normal range (${overallVariance.toFixed(1)}%). No action required.`});

  // Run-rate vs forecast
  if(latRR!==null&&dailyForecast){
    const diff=((latRR-dailyForecast)/dailyForecast)*100;
    if(diff>5)
      items.push({cls:'ins-red',icon:'📈',msg:`Run-rate projection (${Math.round(latRR).toLocaleString()}) suggests EOD volume may exceed daily forecast by ${diff.toFixed(1)}%.`});
    else if(diff<-5)
      items.push({cls:'ins-blue',icon:'📉',msg:`Run-rate projection (${Math.round(latRR).toLocaleString()}) tracking ${Math.abs(diff).toFixed(1)}% below daily forecast.`});
  }

  // Spike/dip
  if(spike&&Math.abs(spike.deviation)>10)
    items.push({cls:'ins-yellow',icon:'⚡',msg:`Spike detected at ${spike.interval}: +${spike.deviation.toFixed(1)}% above historical.`});
  if(dip&&Math.abs(dip.deviation)>10)
    items.push({cls:'ins-yellow',icon:'⬇️',msg:`Significant dip at ${dip.interval}: ${dip.deviation.toFixed(1)}% below historical.`});

  // Traffic pattern
  if(trafficPattern.label==='Front-Loaded')
    items.push({cls:'ins-yellow',icon:'🕗',msg:'Front-loaded traffic detected. Expect lower volumes in afternoon and evening.'});
  else if(trafficPattern.label==='Delayed Peak')
    items.push({cls:'ins-blue',icon:'🕑',msg:'Delayed peak pattern — traffic building. Ensure adequate afternoon staffing.'});
  else if(trafficPattern.label==='Evening Surge')
    items.push({cls:'ins-red',icon:'🌙',msg:'Unusual evening surge detected. Late-day staffing alignment recommended.'});

  // Backlog risk
  const lastBl=backlog.reduce((best,v,i)=>v!==null?i:best,-1);
  if(lastBl>=0){
    const b=backlog[lastBl];
    if(b.status==='critical')
      items.push({cls:'ins-red',icon:'🚨',msg:'Backlog Risk: CRITICAL — remaining calls significantly exceed available capacity.'});
    else if(b.status==='risk')
      items.push({cls:'ins-yellow',icon:'⚠️',msg:'Backlog Risk: Remaining call volume approaching capacity limits.'});
    else
      items.push({cls:'ins-green',icon:'✅',msg:'Backlog Risk: Safe — available capacity sufficient for remaining volume.'});
  }

  // Period warnings
  if(periods.morning.avg!==null&&Math.abs(periods.morning.avg)>8)
    items.push({cls:'ins-yellow',icon:'🌅',msg:`Morning period running ${periods.morning.avg>0?'+':''}${periods.morning.avg.toFixed(1)}% vs historical.`});

  return items.slice(0,6); // cap at 6 insights
}

function renderInsights(items) {
  const el=document.getElementById('operationalInsight');
  el.innerHTML=items.map(it=>
    `<div class="ins-item ${it.cls}">
       <span class="ins-item__icon">${it.icon}</span>
       <span>${it.msg}</span>
     </div>`
  ).join('');
}

/* ============================================================
   8. EXECUTIVE NARRATIVE
   ============================================================ */
function buildNarrative(data) {
  const {periods,spike,dip,overallVariance,status,risk,trafficPattern,blended,dailyForecast} = data;
  if(overallVariance===null) return null;

  const fmt=v=>v!==null?`${v>0?'+':''}${v.toFixed(1)}%`:'N/A';
  const lines=[];

  Object.values(periods).forEach(p=>{
    if(p.avg!==null) lines.push(`${p.label}: ${descDev(p.avg)} (${fmt(p.avg)})`);
  });
  if(spike) lines.push(`Largest spike: ${spike.interval} (${fmt(spike.deviation)})`);
  if(dip)   lines.push(`Largest dip: ${dip.interval} (${fmt(dip.deviation)})`);
  if(overallVariance!==null) lines.push(`Average interval deviation: ${fmt(overallVariance)}`);

  let interp='';
  if(trafficPattern.label==='Front-Loaded') interp="Front-loaded pattern — higher early volumes tapering off.";
  else if(trafficPattern.label==='Delayed Peak') interp="Delayed peak — traffic building through the day.";
  else if(Math.abs(overallVariance)<=3) interp="Arrival pattern closely tracking historical norms.";
  else if(overallVariance>5) interp="Overall volumes elevated above historical — demand pressure is high.";
  else if(overallVariance<-5) interp="Overall volumes running below historical — softer demand.";
  else interp="Minor deviations from historical norms. Continued monitoring recommended.";

  let rec='';
  switch(status.cls){
    case 'card-normal':   rec='No immediate staffing action required. Continue standard cadence.'; break;
    case 'card-drifting': rec='Monitor upcoming intervals before adjusting staffing.'; break;
    case 'card-major':    rec='Consider intraday reforecast. Staffing alignment review recommended.'; break;
    default:              rec='Enter data to generate recommendation.';
  }

  return{lines,interp,rec};
}

function descDev(pct) {
  const a=Math.abs(pct), d=pct>0?'above':'below';
  if(a<=2) return'Tracking at expected levels';
  if(a<=5) return`Slightly ${d} historical`;
  if(a<=10) return`Moderately ${d} historical`;
  return `Significantly ${d} historical`;
}

function renderNarrative(summary) {
  const el=document.getElementById('executiveNarrative');
  if(!summary){el.innerHTML='<p class="ph">Load data to generate executive summary.</p>';return;}
  const lines=summary.lines.map(l=>`<div class="n-line"><span class="n-dot"></span><span>${l}</span></div>`).join('');
  el.innerHTML=`${lines}
    <div class="n-section">Interpretation</div>
    <div class="n-line"><span class="n-dot" style="background:#7c3aed"></span><span>${summary.interp}</span></div>
    <div class="n-section">Recommendation</div>
    <div class="n-line"><span class="n-dot" style="background:var(--green-600)"></span><span>${summary.rec}</span></div>`;
}

function renderPeriods(periods) {
  const el=document.getElementById('periodBreakdown');
  if(!periods){el.innerHTML='<p class="ph">Period analysis will appear here.</p>';return;}
  el.innerHTML=Object.values(periods).map(p=>{
    const val=p.avg!==null?`${p.avg>0?'+':''}${p.avg.toFixed(1)}%`:'—';
    const cls=p.avg===null?'pv-neutral':Math.abs(p.avg)<=5?'pv-green':Math.abs(p.avg)<=10?'pv-yellow':'pv-red';
    return`<div class="period-row"><span class="period-label">${p.label}</span><span class="period-val ${cls}">${val}</span></div>`;
  }).join('');
}

/* ============================================================
   9. CHARTS
   ============================================================ */
const CH = {
  blue:   '#2563eb', blueA: 'rgba(37,99,235,.12)',
  teal:   '#0d9488', tealA: 'rgba(13,148,136,.1)',
  green:  '#059669', greenA:'rgba(5,150,105,.1)',
  amber:  '#d97706', amberA:'rgba(217,119,6,.1)',
  purple: '#7c3aed', purpleA:'rgba(124,58,237,.08)',
  grid:   'rgba(13,21,38,.05)',
  axis:   'rgba(13,21,38,.1)',
  text:   '#9aa4b8',
};

let cForecast=null, cArrival=null, cDeviation=null;

function initCharts() {
  Chart.defaults.color=CH.text;
  Chart.defaults.font.family="'Inter', sans-serif";
  Chart.defaults.font.size=11;

  // 1. Forecast vs Actual
  cForecast=new Chart(document.getElementById('forecastChart'),{
    type:'line',
    data:{labels:INTERVALS,datasets:[
      {label:'Today Actual',data:new Array(N).fill(null),borderColor:CH.purple,backgroundColor:CH.purpleA,borderWidth:2.5,pointRadius:1.5,tension:.35,fill:true},
      {label:'Hist. Avg',data:new Array(N).fill(null),borderColor:CH.blue,backgroundColor:CH.blueA,borderWidth:2,pointRadius:1.5,tension:.35,fill:false,borderDash:[4,3]},
      {label:'Run-Rate EOD',data:new Array(N).fill(null),borderColor:CH.amber,backgroundColor:CH.amberA,borderWidth:2,pointRadius:1.5,tension:.4,fill:false,borderDash:[6,3]},
      {label:'Blended Forecast',data:new Array(N).fill(null),borderColor:CH.green,backgroundColor:CH.greenA,borderWidth:2.5,pointRadius:1.5,tension:.4,fill:false},
    ]},
    options:lineOpts(false),
  });

  // 2. Arrival Pattern
  cArrival=new Chart(document.getElementById('arrivalChart'),{
    type:'line',
    data:{labels:INTERVALS,datasets:[
      {label:'Arrival Pattern %',data:new Array(N).fill(null),borderColor:CH.teal,backgroundColor:CH.tealA,borderWidth:2,pointRadius:1.5,tension:.4,fill:true},
    ]},
    options:lineOpts(true),
  });

  // 3. Deviation bars
  cDeviation=new Chart(document.getElementById('deviationChart'),{
    type:'bar',
    data:{labels:INTERVALS,datasets:[
      {label:'Deviation %',data:new Array(N).fill(null),backgroundColor:new Array(N).fill('rgba(59,130,246,.4)'),borderColor:new Array(N).fill(CH.blue),borderWidth:1,borderRadius:2},
    ]},
    options:barOpts(),
  });
}

function updateCharts(histAvgs, arrivalPct, devs, runRate, blended) {
  // Forecast chart
  cForecast.data.datasets[0].data=state.rows.map(r=>r.today);
  cForecast.data.datasets[1].data=histAvgs.map(v=>v!==null?+v.toFixed(1):null);
  // Run-rate shown as repeated EOD estimate across completed intervals
  cForecast.data.datasets[2].data=runRate.map(v=>v!==null?+v.toFixed(0):null);
  cForecast.data.datasets[3].data=blended.map(v=>v!==null?+v.toFixed(0):null);
  cForecast.update('none');

  // Arrival pattern
  cArrival.data.datasets[0].data=arrivalPct.map(v=>v!==null?+(v*100).toFixed(2):null);
  cArrival.update('none');

  // Deviation bars
  const dd=devs.map(d=>d!==null?+d.toFixed(2):null);
  cDeviation.data.datasets[0].data=dd;
  cDeviation.data.datasets[0].backgroundColor=dd.map(d=>{
    if(d===null) return 'rgba(148,163,184,.3)';
    const a=Math.abs(d);
    if(a<=5)  return d>0?'rgba(239,68,68,.35)':'rgba(22,163,74,.35)';
    if(a<=10) return 'rgba(217,119,6,.45)';
    return 'rgba(220,38,38,.55)';
  });
  cDeviation.data.datasets[0].borderColor=dd.map(d=>{
    if(d===null) return '#94a3b8';
    const a=Math.abs(d);
    if(a<=5)  return d>0?'#ef4444':'#16a34a';
    if(a<=10) return '#d97706';
    return '#dc2626';
  });
  cDeviation.update('none');
}

function lineOpts(compact=false){
  return{
    responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{position:'top',labels:{boxWidth:10,padding:12,color:'#475569',font:{size:10.5}}},
      tooltip:tooltipStyle(),
    },
    scales:{
      x:{ticks:{color:CH.text,maxRotation:45,autoSkip:true,maxTicksLimit:compact?8:10,font:{size:9}},grid:{color:CH.grid},border:{color:CH.axis}},
      y:{ticks:{color:CH.text,font:{size:10}},grid:{color:CH.grid},border:{color:CH.axis}},
    },
    animation:{duration:0}, // disabled for performance with 61 rows
  };
}
function barOpts(){
  return{
    responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:tooltipStyle()},
    scales:{
      x:{ticks:{color:CH.text,maxRotation:45,autoSkip:true,maxTicksLimit:10,font:{size:9}},grid:{color:CH.grid},border:{color:CH.axis}},
      y:{title:{display:true,text:'Deviation %',color:CH.text,font:{size:10}},ticks:{color:CH.text,font:{size:10}},grid:{color:CH.grid},border:{color:CH.axis}},
    },
    animation:{duration:0},
  };
}
function tooltipStyle(){
  return{
    backgroundColor:'rgba(13,21,38,.92)',borderColor:'rgba(37,99,235,.25)',borderWidth:1,
    titleColor:'#f1f5f9',bodyColor:'#94a3b8',padding:10,cornerRadius:8,
  };
}

/* ============================================================
   10. EXPORT
   ============================================================ */
function buildExportText(analysis) {
  if(!analysis) return 'No analysis data. Please enter data first.';
  const {status,risk,overallVariance,trafficPattern,periods,spike,dip,narrative,blended,runRate,dailyForecast} = analysis;
  const fmt=v=>v!==null?`${v>0?'+':''}${v.toFixed(1)}%`:'N/A';
  const fmtI=v=>v!==null?Math.round(v).toLocaleString():'N/A';
  const now=new Date().toLocaleString();
  let t=`INTRADAY INTELLIGENCE DASHBOARD\nGenerated: ${now}\n${'─'.repeat(52)}\n\n`;
  t+=`PATTERN STATUS:    ${status.label}\n`;
  t+=`AVG DEVIATION:     ${fmt(overallVariance)}\n`;
  t+=`SERVICE RISK:      ${risk.label}\n`;
  t+=`TRAFFIC PATTERN:   ${trafficPattern.label}\n`;

  // Get latest blended and run-rate
  let latBl=null; for(let i=N-1;i>=0;i--){if(blended[i]!==null){latBl=blended[i];break;}}
  let latRR=null; for(let i=N-1;i>=0;i--){if(runRate[i]!==null){latRR=runRate[i];break;}}
  t+=`BLENDED FORECAST:  ${fmtI(latBl)}\n`;
  t+=`RUN-RATE PROJ.:    ${fmtI(latRR)}\n`;
  if(dailyForecast) t+=`DAILY FORECAST:    ${fmtI(dailyForecast)}\n`;

  t+=`\nPERIOD SUMMARY\n${'─'.repeat(32)}\n`;
  Object.values(periods).forEach(p=>{ t+=`${p.label}: ${fmt(p.avg)}\n`; });
  if(spike) t+=`\nLargest Spike: ${spike.interval} (${fmt(spike.deviation)})\n`;
  if(dip)   t+=`Largest Dip:   ${dip.interval} (${fmt(dip.deviation)})\n`;
  if(narrative){
    t+=`\nNARRATIVE\n${'─'.repeat(32)}\n`;
    narrative.lines.forEach(l=>{t+=`• ${l}\n`;});
    t+=`\nInterpretation:\n${narrative.interp}\n\nRecommendation:\n${narrative.rec}\n`;
  }
  t+=`\n${'─'.repeat(52)}\nIntraday Intelligence Dashboard | Workforce Intelligence Suite\nBuilt by Abdul Basit\n`;
  return t;
}

function updateExportPreview(analysis){
  document.getElementById('exportPreview').textContent=buildExportText(analysis);
}

/* ============================================================
   11. MAIN RECALCULATION PIPELINE (debounced)
   ============================================================ */
let _recalcTimer=null;
function scheduleRecalc(){
  clearTimeout(_recalcTimer);
  _recalcTimer=setTimeout(runRecalc, 60);
}

function runRecalc() {
  const histAvgs       = calcHistAvg();
  const arrivalPct     = calcArrivalPattern(histAvgs);
  const histCompletion = calcHistCompletion(histAvgs);
  const devs           = calcDeviation(histAvgs);
  const cumActual      = calcCumActual();
  const cumHist        = calcCumHist(histAvgs);
  const dailyForecast  = state.dailyForecast;
  const availCap       = state.availableCapacity;

  // Hist proj uses dailyForecast * arrivalPct (interval-level expected)
  const histProj   = calcHistProj(arrivalPct, dailyForecast);
  // Run-rate: EOD estimate per interval
  const runRate    = calcRunRate(cumActual, histCompletion);
  // Blended EOD estimate
  const blended    = calcBlended(histProj, runRate, histCompletion, dailyForecast);
  const remaining  = calcRemaining(blended, cumActual);
  const confidence = calcConfidence(devs, histCompletion, blended, dailyForecast);
  const backlog    = calcBacklog(remaining, histCompletion, availCap);

  const overallVariance = calcOverallVariance(devs);
  const spike           = findSpike(devs);
  const dip             = findDip(devs);
  const periods         = calcPeriods(devs);
  const status          = detectStatus(overallVariance);
  const risk            = detectRisk(overallVariance);
  const trafficPattern  = detectPattern(periods);
  const narrative       = buildNarrative({periods,spike,dip,overallVariance,status,risk,trafficPattern,blended,dailyForecast});

  const analysis={
    histAvgs,arrivalPct,histCompletion,devs,cumActual,cumHist,
    histProj,runRate,blended,remaining,confidence,backlog,
    overallVariance,spike,dip,periods,status,risk,trafficPattern,narrative,
    dailyForecast,availCap,
  };
  state.analysis=analysis;

  // Batch DOM updates
  updateCells(histAvgs,arrivalPct,histCompletion,devs,histProj,runRate,blended,confidence,remaining,backlog);
  updateKPIs({...analysis});
  renderInsights(buildInsights({...analysis}));
  renderNarrative(narrative);
  renderPeriods(periods);
  updateCharts(histAvgs,arrivalPct,devs,runRate,blended);
  updateExportPreview(analysis);
}

/* ============================================================
   12. BULK PASTE (vertical columns)
   ============================================================ */
function applyColumnPaste(colIndex, rawText) {
  const vals = rawText.split('\n')
    .map(l=>l.trim()).filter(l=>l!=='')
    .map(l=>parseFloat(l.replace(/,/g,'')));

  let applied=0;
  for(let i=0;i<N&&i<vals.length;i++){
    const v=vals[i];
    if(isNaN(v)) continue;
    if(colIndex==='today'){
      state.rows[i].today=v;
      const inp=document.getElementById(`t-${i}`);
      if(inp) inp.value=v;
    } else {
      const d=parseInt(colIndex);
      state.rows[i].days[d]=v;
      const inp=document.getElementById(`w${d}-${i}`);
      if(inp) inp.value=v;
    }
    applied++;
  }
  scheduleRecalc();
  return applied;
}

/* ============================================================
   13. EXCEL CTRL+V PASTE
   ============================================================ */
function handleTablePaste(e) {
  const text=e.clipboardData.getData('text/plain');
  if(!text.includes('\t')) return; // not tab-separated, let default handle
  e.preventDefault();

  const lines=text.trim().split('\n');
  const matrix=lines.map(l=>l.split('\t').map(c=>c.trim()));

  // Determine start row from focused cell or default 0
  const active=document.activeElement;
  let startRow=0;
  if(active&&active.id){
    const m=active.id.match(/-(\d+)$/);
    if(m) startRow=parseInt(m[1]);
  }

  // Determine start column from focused cell
  let startCol=0; // 0=week1...4=week5, 'today'=today
  if(active&&active.id){
    const m=active.id.match(/^(w(\d)-\d+|t-\d+)$/);
    if(m){
      if(active.id.startsWith('t-')) startCol='today';
      else startCol=parseInt(active.id.match(/^w(\d)/)[1]);
    }
  }

  let applied=0;
  matrix.forEach((row,ri)=>{
    const rowIdx=startRow+ri;
    if(rowIdx>=N) return;
    row.forEach((cell,ci)=>{
      const v=parseFloat(cell.replace(/,/g,''));
      if(isNaN(v)) return;
      if(startCol==='today'){
        state.rows[rowIdx].today=v;
        const inp=document.getElementById(`t-${rowIdx}`);
        if(inp) inp.value=v;
        applied++;
      } else {
        const colD=startCol+ci;
        if(colD<5){
          state.rows[rowIdx].days[colD]=v;
          const inp=document.getElementById(`w${colD}-${rowIdx}`);
          if(inp) inp.value=v;
          applied++;
        } else if(colD===5){
          // 6th col maps to today
          state.rows[rowIdx].today=v;
          const inp=document.getElementById(`t-${rowIdx}`);
          if(inp) inp.value=v;
          applied++;
        }
      }
    });
  });

  if(applied>0){
    scheduleRecalc();
    showToast(`Pasted ${applied} values from clipboard`);
  }
}

/* ============================================================
   14. EXAMPLE DATA
   ============================================================ */
function loadExample() {
  const base=[
    18,24,30,38,52,65,78,88,96,102,108,114,
    118,122,125,122,112,105,98,92,88,85,82,80,
    84,89,94,98,102,104,106,102,94,84,72,60,
    48,36,26,18,14,12,11,10,9,9,8,8,
    7,7,6,6,5,5,4,4,3,3,3,2,2
  ];
  const todayShift=[
    -.12,-.10,-.09,-.08,-.07,-.06,-.05,-.04,
    -.02,-.01,.01,.02,.02,.03,.03,.02,
    -.02,-.03,-.02,-.01,.01,.02,.03,.04,
    .05,.07,.09,.10,.11,.12,.10,.09,
    .08,.07,.06,.05,.04,.03,.02,.01,
    .01,.00,-.01,-.01,.00,.00,.00,.00,
    .00,.00,.00,.00,.00,.00,.00,.00,
    .00,.00,.00,.00,.00
  ];
  const rng=(s)=>{ const x=Math.sin(s)*10000; return .93+(x-Math.floor(x))*.14; };

  INTERVALS.forEach((_,i)=>{
    const b=base[i]||2;
    for(let d=0;d<5;d++){
      const v=Math.max(0,Math.round(b*rng(i*7+d*13+42)));
      state.rows[i].days[d]=v;
      const inp=document.getElementById(`w${d}-${i}`);
      if(inp) inp.value=v;
    }
    const tv=Math.max(0,Math.round(b*(1+(todayShift[i]||0))));
    state.rows[i].today=tv;
    const inp=document.getElementById(`t-${i}`);
    if(inp) inp.value=tv;
  });

  // Set example daily forecast
  document.getElementById('dailyForecastInput').value=2500;
  state.dailyForecast=2500;
  document.getElementById('availableCapacityInput').value=2400;
  state.availableCapacity=2400;

  scheduleRecalc();
  showToast('Example data loaded');
}

function clearAll() {
  state.rows.forEach((_,i)=>{
    state.rows[i]={days:[null,null,null,null,null],today:null};
    for(let d=0;d<5;d++){
      const inp=document.getElementById(`w${d}-${i}`);
      if(inp) inp.value='';
    }
    const inp=document.getElementById(`t-${i}`);
    if(inp) inp.value='';
  });
  // Clear paste textareas
  ['pasteW1','pasteW2','pasteW3','pasteW4','pasteW5','pasteToday'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value='';
  });
  document.getElementById('dailyForecastInput').value='';
  document.getElementById('availableCapacityInput').value='';
  state.dailyForecast=null;
  state.availableCapacity=null;
  state.analysis=null;
  scheduleRecalc();
  showToast('All data cleared');
}

/* ============================================================
   15. TOAST
   ============================================================ */
function showToast(msg){
  let t=document.getElementById('_toast');
  if(!t){
    t=document.createElement('div');
    t.id='_toast';t.className='toast';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.classList.add('toast--on');
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('toast--on'),2600);
}

/* ============================================================
   16. EXPORT HELPERS
   ============================================================ */
function exportOutlook(){
  const b=buildExportText(state.analysis);
  window.location.href=`mailto:?subject=${encodeURIComponent('Intraday Intelligence Report')}&body=${encodeURIComponent(b)}`;
}
function exportGmail(){
  const b=buildExportText(state.analysis);
  window.open(`https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Intraday Intelligence Report')}&body=${encodeURIComponent(b)}`,'_blank');
}
async function copySummary(){
  const t=buildExportText(state.analysis);
  try{await navigator.clipboard.writeText(t);}
  catch{
    const ta=document.createElement('textarea');
    ta.value=t;ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
  }
  showToast('Summary copied to clipboard');
}
function downloadReport(){
  const t=buildExportText(state.analysis);
  const blob=new Blob([t],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`intraday-analysis-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();URL.revokeObjectURL(url);
  showToast('Report downloaded');
}

/* ============================================================
   17. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded',()=>{
  buildTable();
  initCharts();
  runRecalc();

  // Hero buttons
  document.getElementById('loadExampleBtn').addEventListener('click',loadExample);
  document.getElementById('clearDataBtn').addEventListener('click',clearAll);

  // Bulk paste apply buttons
  document.querySelectorAll('.btn--paste').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const col=btn.dataset.col;
      const taId=col==='today'?'pasteToday':`pasteW${parseInt(col)+1}`;
      const ta=document.getElementById(taId);
      if(!ta||!ta.value.trim()){showToast('Nothing to paste');return;}
      const n=applyColumnPaste(col==='today'?'today':col,ta.value);
      showToast(`Applied ${n} values to ${col==='today'?'Today':' Week −'+(parseInt(col)+1)}`);
    });
  });

  // Excel paste on table
  document.getElementById('tableWrapper').addEventListener('paste',handleTablePaste);
  document.getElementById('dataTable').addEventListener('paste',handleTablePaste);

  // Daily forecast input
  document.getElementById('dailyForecastInput').addEventListener('input',e=>{
    state.dailyForecast=parseFloat(e.target.value)||null;
    scheduleRecalc();
  });

  // Capacity input
  document.getElementById('availableCapacityInput').addEventListener('input',e=>{
    state.availableCapacity=parseFloat(e.target.value)||null;
    scheduleRecalc();
  });

  // Export
  document.getElementById('outlookBtn').addEventListener('click',exportOutlook);
  document.getElementById('gmailBtn').addEventListener('click',exportGmail);
  document.getElementById('copyBtn').addEventListener('click',copySummary);
  document.getElementById('downloadBtn').addEventListener('click',downloadReport);

  // Mobile nav
  const toggle=document.getElementById('menuToggle');
  const nav=document.querySelector('.nav-links');
  if(toggle&&nav){
    toggle.addEventListener('click',()=>{
      nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded',nav.classList.contains('open'));
    });
  }
});
