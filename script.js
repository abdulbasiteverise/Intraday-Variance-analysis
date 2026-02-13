// Intraday Pattern Deviation Analysis - JavaScript
// Volume-only analysis, no FTE calculations

// Global state
const state = {
    data: [],
    selectedColumn: null
};

// Time intervals generator (9:00 AM to 11:00 PM, 56 intervals)
function generateTimeIntervals() {
    const intervals = [];
    const startHour = 9;
    const endHour = 23;
    
    for (let hour = startHour; hour <= endHour; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            if (hour === 23 && minute > 0) break; // Stop at 11:00 PM
            
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            const timeStr = `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
            intervals.push(timeStr);
        }
    }
    
    return intervals;
}

// Initialize data structure
function initializeData() {
    const intervals = generateTimeIntervals();
    state.data = intervals.map(time => ({
        time: time,
        day1: 0,
        day2: 0,
        day3: 0,
        day4: 0,
        day5: 0,
        histAvg: 0,
        today: 0,
        variance: 0,
        variancePct: 0,
        cumVariance: 0
    }));
}

// Calculate all metrics
function calculateMetrics() {
    let cumVariance = 0;
    
    state.data.forEach(row => {
        // Historical Average
        row.histAvg = (row.day1 + row.day2 + row.day3 + row.day4 + row.day5) / 5;
        
        // Variance
        row.variance = row.today - row.histAvg;
        
        // Variance %
        row.variancePct = row.histAvg !== 0 ? row.variance / row.histAvg : 0;
        
        // Cumulative Variance
        cumVariance += row.variance;
        row.cumVariance = cumVariance;
    });
}

// Generate sample data
function generateSampleData() {
    state.data.forEach((row, i) => {
        // Create realistic call pattern - higher during business hours
        const hour = parseInt(row.time.split(':')[0]);
        const isPM = row.time.includes('PM');
        const actualHour = isPM && hour !== 12 ? hour + 12 : (hour === 12 && !isPM ? 0 : hour);
        
        // Peak hours: 10AM-12PM and 2PM-4PM
        let baseVolume;
        if ((actualHour >= 10 && actualHour < 12) || (actualHour >= 14 && actualHour < 16)) {
            baseVolume = 150;
        } else if ((actualHour >= 9 && actualHour < 10) || (actualHour >= 12 && actualHour < 14) || (actualHour >= 16 && actualHour < 18)) {
            baseVolume = 120;
        } else {
            baseVolume = 80;
        }
        
        // Add variation for each day
        row.day1 = Math.max(0, Math.floor(baseVolume + (Math.random() * 30 - 15)));
        row.day2 = Math.max(0, Math.floor(baseVolume + (Math.random() * 30 - 15)));
        row.day3 = Math.max(0, Math.floor(baseVolume + (Math.random() * 30 - 15)));
        row.day4 = Math.max(0, Math.floor(baseVolume + (Math.random() * 30 - 15)));
        row.day5 = Math.max(0, Math.floor(baseVolume + (Math.random() * 30 - 15)));
        row.today = Math.max(0, Math.floor(baseVolume + (Math.random() * 50 - 25)));
    });
    
    calculateMetrics();
    renderTable();
    updateSummary();
    renderCharts();
}

// Clear all data
function clearData() {
    state.data.forEach(row => {
        row.day1 = 0;
        row.day2 = 0;
        row.day3 = 0;
        row.day4 = 0;
        row.day5 = 0;
        row.today = 0;
    });
    
    calculateMetrics();
    renderTable();
    updateSummary();
    renderCharts();
}

// Render data table
function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    state.data.forEach((row, index) => {
        const tr = document.createElement('tr');
        
        // Time column
        const timeCell = document.createElement('td');
        timeCell.className = 'time-cell';
        timeCell.textContent = row.time;
        tr.appendChild(timeCell);
        
        // Input columns (Day 1-5)
        ['day1', 'day2', 'day3', 'day4', 'day5'].forEach(field => {
            const td = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.value = row[field];
            input.dataset.row = index;
            input.dataset.field = field;
            input.addEventListener('change', handleInputChange);
            input.addEventListener('focus', handleInputFocus);
            td.appendChild(input);
            tr.appendChild(td);
        });
        
        // Historical Average (calculated)
        const histAvgCell = document.createElement('td');
        histAvgCell.className = 'calc-col';
        histAvgCell.textContent = row.histAvg.toFixed(1);
        tr.appendChild(histAvgCell);
        
        // Today Actual (input)
        const todayTd = document.createElement('td');
        const todayInput = document.createElement('input');
        todayInput.type = 'number';
        todayInput.min = '0';
        todayInput.value = row.today;
        todayInput.dataset.row = index;
        todayInput.dataset.field = 'today';
        todayInput.addEventListener('change', handleInputChange);
        todayInput.addEventListener('focus', handleInputFocus);
        todayTd.appendChild(todayInput);
        tr.appendChild(todayTd);
        
        // Variance (calculated)
        const varianceCell = document.createElement('td');
        varianceCell.className = 'calc-col ' + (row.variance > 0 ? 'variance-positive' : 'variance-negative');
        varianceCell.textContent = row.variance.toFixed(1);
        tr.appendChild(varianceCell);
        
        // Variance % (calculated)
        const variancePctCell = document.createElement('td');
        variancePctCell.className = 'calc-col variance-pct-col ' + getDeviationClass(row.variancePct);
        variancePctCell.textContent = (row.variancePct * 100).toFixed(1) + '%';
        tr.appendChild(variancePctCell);
        
        // Cumulative Variance (calculated)
        const cumVarianceCell = document.createElement('td');
        cumVarianceCell.className = 'calc-col';
        cumVarianceCell.textContent = row.cumVariance.toFixed(1);
        tr.appendChild(cumVarianceCell);
        
        tbody.appendChild(tr);
    });
}

// Get deviation class based on variance percentage
function getDeviationClass(variancePct) {
    const absVar = Math.abs(variancePct);
    if (absVar <= 0.10) return 'deviation-green';
    if (absVar <= 0.20) return 'deviation-yellow';
    return 'deviation-red';
}

// Handle input change
function handleInputChange(e) {
    const row = parseInt(e.target.dataset.row);
    const field = e.target.dataset.field;
    const value = parseFloat(e.target.value) || 0;
    
    state.data[row][field] = Math.max(0, value);
    
    calculateMetrics();
    renderTable();
    updateSummary();
    renderCharts();
}

// Handle input focus for column selection
function handleInputFocus(e) {
    state.selectedColumn = e.target.dataset.field;
}

// Quick fill column
function quickFillColumn() {
    if (!state.selectedColumn) {
        alert('Please click on a column first to select it');
        return;
    }
    
    const value = parseFloat(document.getElementById('fill-value').value);
    if (isNaN(value) || value < 0) {
        alert('Please enter a valid positive number');
        return;
    }
    
    state.data.forEach(row => {
        row[state.selectedColumn] = value;
    });
    
    calculateMetrics();
    renderTable();
    updateSummary();
    renderCharts();
}

// Update summary section
function updateSummary() {
    // Morning (9AM-12PM) - first 12 intervals
    const morningData = state.data.slice(0, 12);
    const morningAvg = morningData.reduce((sum, row) => sum + row.variancePct, 0) / morningData.length;
    document.getElementById('morning-avg').textContent = (morningAvg * 100).toFixed(1) + '%';
    document.getElementById('morning-avg').style.color = getColorForDeviation(morningAvg);
    
    // Midday (12PM-3PM) - next 12 intervals
    const middayData = state.data.slice(12, 24);
    const middayAvg = middayData.reduce((sum, row) => sum + row.variancePct, 0) / middayData.length;
    document.getElementById('midday-avg').textContent = (middayAvg * 100).toFixed(1) + '%';
    document.getElementById('midday-avg').style.color = getColorForDeviation(middayAvg);
    
    // Late day (3PM-11PM) - remaining intervals
    const latedayData = state.data.slice(24);
    const latedayAvg = latedayData.reduce((sum, row) => sum + row.variancePct, 0) / latedayData.length;
    document.getElementById('lateday-avg').textContent = (latedayAvg * 100).toFixed(1) + '%';
    document.getElementById('lateday-avg').style.color = getColorForDeviation(latedayAvg);
    
    // Largest spike
    const maxVariance = state.data.reduce((max, row) => row.variancePct > max.variancePct ? row : max, state.data[0]);
    document.getElementById('largest-spike-time').textContent = maxVariance.time;
    document.getElementById('largest-spike-pct').textContent = (maxVariance.variancePct * 100).toFixed(1) + '%';
    
    // Largest dip
    const minVariance = state.data.reduce((min, row) => row.variancePct < min.variancePct ? row : min, state.data[0]);
    document.getElementById('largest-dip-time').textContent = minVariance.time;
    document.getElementById('largest-dip-pct').textContent = (minVariance.variancePct * 100).toFixed(1) + '%';
    
    // Net cumulative variance
    const netVariance = state.data[state.data.length - 1].cumVariance;
    document.getElementById('net-variance').textContent = netVariance.toFixed(0);
    document.getElementById('net-variance').style.color = netVariance > 0 ? '#ef4444' : '#10b981';
    
    // Generate narrative
    generateNarrative(morningAvg, middayAvg, latedayAvg, maxVariance, minVariance, netVariance);
}

// Get color for deviation
function getColorForDeviation(variance) {
    const absVar = Math.abs(variance);
    if (absVar <= 0.10) return '#10b981';
    if (absVar <= 0.20) return '#f59e0b';
    return '#ef4444';
}

// Generate executive narrative
function generateNarrative(morningAvg, middayAvg, latedayAvg, maxVariance, minVariance, netVariance) {
    const narrativeDiv = document.getElementById('narrative-content');
    
    const hasData = state.data.some(row => row.today > 0 || row.day1 > 0);
    if (!hasData) {
        narrativeDiv.innerHTML = '<p class="loading-message">Enter data to generate analysis narrative...</p>';
        return;
    }
    
    let narrative = '<h4>PATTERN DEVIATION ANALYSIS</h4>';
    
    // Morning analysis
    narrative += '<p><strong>Morning Period (9:00 AM - 12:00 PM):</strong> ';
    if (Math.abs(morningAvg) <= 0.10) {
        narrative += 'Morning volume aligned well with historical patterns, showing minimal deviation. The actual volume tracked closely with expected patterns.';
    } else if (morningAvg > 0.10) {
        narrative += `Volume exceeded historical patterns by an average of ${(morningAvg * 100).toFixed(1)}%, indicating a significant morning spike. This pattern distortion suggests actual demand surpassed historical baselines during the critical morning ramp-up period.`;
    } else {
        narrative += `Volume ran below historical patterns by ${(Math.abs(morningAvg) * 100).toFixed(1)}%, indicating lower-than-expected morning demand. Actual volume fell short of historical averages during the early operating window.`;
    }
    narrative += '</p>';
    
    // Midday analysis
    narrative += '<p><strong>Midday Period (12:00 PM - 3:00 PM):</strong> ';
    if (Math.abs(middayAvg) <= 0.10) {
        narrative += 'Midday volume tracked closely with forecasted patterns. The lunch-hour period showed minimal pattern distortion relative to historical baselines.';
    } else if (middayAvg > 0.10) {
        narrative += `Lunch-hour volume spiked ${(middayAvg * 100).toFixed(1)}% above historical averages. This represents significant midday pattern deviation, with actual demand exceeding expected volume during this traditionally volatile period.`;
    } else {
        narrative += `Midday showed ${(Math.abs(middayAvg) * 100).toFixed(1)}% lower volume than historical patterns. Actual demand fell below expectations during the lunch window, creating a midday volume dip.`;
    }
    narrative += '</p>';
    
    // Late day analysis
    narrative += '<p><strong>Late Day Period (3:00 PM - 11:00 PM):</strong> ';
    if (Math.abs(latedayAvg) <= 0.10) {
        narrative += 'Afternoon and evening patterns remained stable relative to historical baselines. The extended operating window showed consistent alignment with expected volume patterns.';
    } else if (latedayAvg > 0.10) {
        narrative += `Late-day volume exceeded forecast by ${(latedayAvg * 100).toFixed(1)}%, creating sustained pattern deviation. Given this represents 57% of the operating day, the cumulative volume impact is significant. Afternoon and evening demand consistently outpaced historical expectations.`;
    } else {
        narrative += `Late-day volume trended ${(Math.abs(latedayAvg) * 100).toFixed(1)}% below expectations. The extended hours period showed sustained lower volume relative to historical patterns, creating an afternoon-evening deficit.`;
    }
    narrative += '</p>';
    
    // Critical intervals
    narrative += '<h4>CRITICAL INTERVALS</h4>';
    narrative += `<p><strong>Largest Spike:</strong> ${maxVariance.time} experienced a ${(maxVariance.variancePct * 100).toFixed(1)}% deviation above historical average, representing the most severe positive variance of the day. This interval showed the greatest volume excess relative to expected patterns.`;
    narrative += `<br><strong>Largest Dip:</strong> ${minVariance.time} showed a ${(Math.abs(minVariance.variancePct) * 100).toFixed(1)}% deviation below historical average, marking the peak negative variance period. This interval experienced the most significant volume shortfall. These extreme variances identify when volume patterns diverged most dramatically from historical baselines.</p>`;
    
    // Cumulative impact
    narrative += '<h4>VOLUME IMPACT ASSESSMENT</h4>';
    narrative += '<p><strong>Cumulative Variance:</strong> ';
    if (Math.abs(netVariance) <= 100) {
        narrative += `The net cumulative variance of ${netVariance.toFixed(0)} calls indicates relatively balanced volume across the day despite intraday fluctuations. Pattern distortions were effectively offset through the operating window, with spikes and dips neutralizing each other.`;
    } else if (netVariance > 100) {
        narrative += `The net cumulative variance of +${netVariance.toFixed(0)} calls represents significant volume excess. Actual demand ran ${netVariance.toFixed(0)} calls above historical patterns when summed across all intervals. This sustained positive deviation compounds throughout the day, creating cumulative volume pressure.`;
    } else {
        narrative += `The net cumulative variance of ${netVariance.toFixed(0)} calls indicates overall volume deficit. Actual demand fell ${Math.abs(netVariance).toFixed(0)} calls short of historical patterns across the operating day. This negative variance accumulated progressively through the intervals.`;
    }
    narrative += '</p>';
    
    // Key insight
    narrative += '<h4>KEY INSIGHT: PATTERN VS. TOTAL VOLUME</h4>';
    narrative += '<p>Even when daily volume totals match forecasts, intraday pattern distortion creates operational challenges. <strong>When volume arrives matters as much as how much volume arrives.</strong> Demand that arrives in a different <em>pattern</em> than expected—even with identical <em>totals</em>—creates misalignment between actual need and planned capacity.</p>';
    
    // Pattern assessment
    const cumVarianceTrend = state.data[state.data.length - 1].cumVariance - state.data[Math.floor(state.data.length / 2)].cumVariance;
    narrative += '<p><strong>Pattern Evolution:</strong> ';
    if (Math.abs(cumVarianceTrend) <= 50) {
        narrative += 'The cumulative variance trend stabilized through the day, indicating pattern deviations balanced out across the operating window. Early variances were offset by opposing movements in later periods.';
    } else if (cumVarianceTrend > 50) {
        narrative += 'The cumulative variance gap widened as the day progressed, suggesting variance compounded without offsetting corrections. Positive deviations accumulated progressively, with late-day periods reinforcing rather than correcting the pattern distortion.';
    } else {
        narrative += 'The cumulative position improved during latter intervals, with late-day patterns helping to correct early variance. Volume normalization occurred through natural pattern convergence in afternoon and evening periods.';
    }
    narrative += '</p>';
    
    // Recommendations
    narrative += '<h4>RECOMMENDED ACTIONS</h4>';
    narrative += '<ul style="margin-left: 1.5rem; margin-top: 0.5rem;">';
    
    if (Math.abs(morningAvg) > 0.15) {
        narrative += `<li>Investigate root causes of morning pattern deviation (${morningAvg > 0 ? 'spike' : 'dip'}). Review whether historical baseline accurately reflects current demand patterns for this day type.</li>`;
    }
    if (Math.abs(middayAvg) > 0.15) {
        narrative += `<li>Analyze midday volume drivers to understand lunch-hour pattern changes. Consider whether midday deviation represents temporary anomaly or emerging trend.</li>`;
    }
    if (Math.abs(latedayAvg) > 0.15) {
        narrative += `<li>Examine late-day pattern shift sustainability. Determine if afternoon-evening deviation warrants historical baseline adjustment for future planning.</li>`;
    }
    if (Math.abs(netVariance) > 200) {
        narrative += `<li>Conduct root cause analysis on sustained pattern distortion. Evaluate whether forecast model assumptions remain valid or require recalibration.</li>`;
    }
    
    narrative += '<li>Archive this analysis for weekly pattern review to identify emerging trends versus one-time anomalies.</li>';
    narrative += '<li>Compare pattern deviations across similar day types to distinguish systematic shifts from random variation.</li>';
    narrative += '<li>Share findings with planning teams to inform future volume forecasting and pattern expectations.</li>';
    narrative += '</ul>';
    
    narrativeDiv.innerHTML = narrative;
}

// Export to CSV
function exportToCSV() {
    let csv = 'Time,Day 1,Day 2,Day 3,Day 4,Day 5,Historical Avg,Today Actual,Variance,Variance %,Cumulative Variance\n';
    
    state.data.forEach(row => {
        csv += `${row.time},${row.day1},${row.day2},${row.day3},${row.day4},${row.day5},`;
        csv += `${row.histAvg.toFixed(2)},${row.today},${row.variance.toFixed(2)},${(row.variancePct * 100).toFixed(2)}%,`;
        csv += `${row.cumVariance.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'intraday_pattern_analysis.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Chart rendering using Canvas API
function renderCharts() {
    renderVolumeChart();
    renderVarianceChart();
    renderCumulativeChart();
}

function renderVolumeChart() {
    const canvas = document.getElementById('volume-chart');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Find max value for scaling
    const maxValue = Math.max(
        ...state.data.map(d => Math.max(d.histAvg, d.today))
    );
    
    if (maxValue === 0) return;
    
    // Draw axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw historical average line
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.data.forEach((d, i) => {
        const x = padding + (chartWidth / (state.data.length - 1)) * i;
        const y = height - padding - (d.histAvg / maxValue) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Draw today actual line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.data.forEach((d, i) => {
        const x = padding + (chartWidth / (state.data.length - 1)) * i;
        const y = height - padding - (d.today / maxValue) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Legend
    ctx.font = '12px Archivo';
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(width - 150, 20, 20, 3);
    ctx.fillStyle = '#475569';
    ctx.fillText('Historical Avg', width - 125, 25);
    
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(width - 150, 35, 20, 3);
    ctx.fillStyle = '#475569';
    ctx.fillText('Today Actual', width - 125, 40);
}

function renderVarianceChart() {
    const canvas = document.getElementById('variance-chart');
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    ctx.clearRect(0, 0, width, height);
    
    const maxVariance = Math.max(...state.data.map(d => Math.abs(d.variancePct)));
    const scale = maxVariance > 0 ? chartHeight / (maxVariance * 2) : chartHeight;
    
    // Draw axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height / 2);
    ctx.lineTo(width - padding, height / 2);
    ctx.stroke();
    
    // Draw bars
    const barWidth = chartWidth / state.data.length - 2;
    state.data.forEach((d, i) => {
        const x = padding + (chartWidth / state.data.length) * i;
        const barHeight = Math.abs(d.variancePct) * scale;
        const y = d.variancePct >= 0 ? height / 2 - barHeight : height / 2;
        
        // Color based on deviation
        const absVar = Math.abs(d.variancePct);
        if (absVar <= 0.10) ctx.fillStyle = '#10b981';
        else if (absVar <= 0.20) ctx.fillStyle = '#f59e0b';
        else ctx.fillStyle = '#ef4444';
        
        ctx.fillRect(x, y, barWidth, barHeight);
    });
    
    // Zero line
    ctx.strokeStyle = '#1f4e78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height / 2);
    ctx.lineTo(width - padding, height / 2);
    ctx.stroke();
}

function renderCumulativeChart() {
    const canvas = document.getElementById('cumulative-chart');
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    ctx.clearRect(0, 0, width, height);
    
    const maxCumVariance = Math.max(...state.data.map(d => Math.abs(d.cumVariance)));
    const scale = maxCumVariance > 0 ? chartHeight / (maxCumVariance * 2) : chartHeight;
    
    // Draw axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw zero line
    const zeroY = height / 2;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(width - padding, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw cumulative variance line
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    state.data.forEach((d, i) => {
        const x = padding + (chartWidth / (state.data.length - 1)) * i;
        const y = zeroY - (d.cumVariance * scale);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Fill area under curve
    const finalVariance = state.data[state.data.length - 1].cumVariance;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = finalVariance >= 0 ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    state.data.forEach((d, i) => {
        const x = padding + (chartWidth / (state.data.length - 1)) * i;
        const y = zeroY - (d.cumVariance * scale);
        ctx.lineTo(x, y);
    });
    ctx.lineTo(width - padding, zeroY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
}

// Event listeners
document.getElementById('load-sample-data').addEventListener('click', generateSampleData);
document.getElementById('clear-data').addEventListener('click', clearData);
document.getElementById('export-csv').addEventListener('click', exportToCSV);
document.getElementById('fill-column').addEventListener('click', quickFillColumn);

// Initialize on page load
window.addEventListener('load', () => {
    initializeData();
    renderTable();
    updateSummary();
    renderCharts();
});

// Handle window resize for charts
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderCharts();
    }, 250);
});
