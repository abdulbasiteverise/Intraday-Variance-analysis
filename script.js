/**

* ═══════════════════════════════════════════════════════════
* INTRADAY INTELLIGENCE DASHBOARD  —  script.js  v3
* Author: Abdul Basit | Workforce Intelligence Suite
* ═══════════════════════════════════════════════════════════
  */

'use strict';

/* ─────────────────────────────────────────────────────────
INTERVALS
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
const N = INTERVALS.length;

/* ─────────────────────────────────────────────────────────
APPLICATION STATE
───────────────────────────────────────────────────────── */

const state = {
rows: [],
analysis: null,
dailyForecast: null,
availableCapacity: null,
};

/* ─────────────────────────────────────────────────────────
TABLE BUILD
───────────────────────────────────────────────────────── */

function buildTable() {

const tbody = document.getElementById('tableBody');
tbody.innerHTML = '';

state.rows = [];

INTERVALS.forEach((interval, i) => {

```
const row = { days:[null,null,null,null,null], today:null };
state.rows.push(row);

const tr = document.createElement('tr');

const label = document.createElement('td');
label.textContent = interval;
tr.appendChild(label);

for(let d=0; d<5; d++){

  const td = document.createElement('td');
  const inp = document.createElement('input');

  inp.type = 'number';

  inp.addEventListener('input', ()=>{
    row.days[d] = parseFloat(inp.value) || null;
    scheduleRecalc();
  });

  td.appendChild(inp);
  tr.appendChild(td);
}

const todayTd = document.createElement('td');
const todayInput = document.createElement('input');

todayInput.type='number';

todayInput.addEventListener('input',()=>{
  row.today = parseFloat(todayInput.value) || null;
  scheduleRecalc();
});

todayTd.appendChild(todayInput);
tr.appendChild(todayTd);

tbody.appendChild(tr);
```

});

}

/* ─────────────────────────────────────────────────────────
HISTORICAL AVERAGE
───────────────────────────────────────────────────────── */

function calcHistAvg(){

return state.rows.map(r=>{

```
const vals = r.days.filter(v=>v!==null);

if(!vals.length) return null;

return vals.reduce((a,b)=>a+b,0)/vals.length;
```

});

}

/* ─────────────────────────────────────────────────────────
ARRIVAL PATTERN
───────────────────────────────────────────────────────── */

function calcArrivalPattern(hist){

const total = hist.reduce((s,v)=>s+(v||0),0);

if(!total) return new Array(N).fill(null);

return hist.map(v=>v!==null? v/total : null);

}

/* ─────────────────────────────────────────────────────────
HIST COMPLETION %
───────────────────────────────────────────────────────── */

function calcHistCompletion(hist){

const total = hist.reduce((s,v)=>s+(v||0),0);

if(!total) return new Array(N).fill(null);

let cum=0;

return hist.map(v=>{

```
cum += (v||0);

return cum/total;
```

});

}

/* ─────────────────────────────────────────────────────────
DEVIATION
───────────────────────────────────────────────────────── */

function calcDeviation(hist){

return state.rows.map((row,i)=>{

```
const h = hist[i];
const t = row.today;

if(h===null || t===null || h===0) return null;

return ((t-h)/h)*100;
```

});

}

/* ─────────────────────────────────────────────────────────
CUM ACTUAL
───────────────────────────────────────────────────────── */

function calcCumActual(){

let cum=0;

return state.rows.map(r=>{

```
if(r.today!==null) cum+=r.today;

return r.today!==null ? cum : null;
```

});

}

/* ─────────────────────────────────────────────────────────
HIST PROJECTION
───────────────────────────────────────────────────────── */

function calcHistProj(arrival,daily){

if(!daily) return new Array(N).fill(null);

return arrival.map(a=>a!==null? daily*a : null);

}

/* ─────────────────────────────────────────────────────────
RUN RATE
───────────────────────────────────────────────────────── */

function calcRunRate(cumActual){

let elapsed=0;

return cumActual.map((cum,i)=>{

```
if(cum===null) return null;

elapsed++;

const rate = cum/elapsed;

const remaining = N - elapsed;

return cum + rate*remaining;
```

});

}

/* ─────────────────────────────────────────────────────────
BLENDED FORECAST
───────────────────────────────────────────────────────── */

function calcBlended(runRate,completion,daily){

return runRate.map((rr,i)=>{

```
if(rr===null) return null;

const comp = completion[i] || 0;

let wH,wR;

if(comp<0.25){
  wH=0.7; wR=0.3;
}else if(comp<0.6){
  wH=0.5; wR=0.5;
}else{
  wH=0.3; wR=0.7;
}

return daily ? (wH*daily + wR*rr) : rr;
```

});

}

/* ─────────────────────────────────────────────────────────
MAIN RECALC
───────────────────────────────────────────────────────── */

let timer=null;

function scheduleRecalc(){

clearTimeout(timer);

timer=setTimeout(runRecalc,50);

}

function runRecalc(){

const histAvg = calcHistAvg();

const arrival = calcArrivalPattern(histAvg);

const completion = calcHistCompletion(histAvg);

const deviation = calcDeviation(histAvg);

const cumActual = calcCumActual();

const histProj = calcHistProj(arrival,state.dailyForecast);

const runRate = calcRunRate(cumActual);

const blended = calcBlended(runRate,completion,state.dailyForecast);

state.analysis = {
histAvg,
arrival,
completion,
deviation,
cumActual,
histProj,
runRate,
blended
};

console.log("Analysis",state.analysis);

}

/* ─────────────────────────────────────────────────────────
INIT
───────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded',()=>{

buildTable();

scheduleRecalc();

});
