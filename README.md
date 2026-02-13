# Intraday Pattern Deviation Analysis Tool

A streamlined static web application for volume pattern analysis. Compares today's intraday volume against historical baselines to identify pattern deviations across 15-minute intervals.

## Features

### Core Functionality
- **56 Intervals**: 9:00 AM to 11:00 PM in 15-minute increments
- **Historical Baseline**: Compares today's volume against 5 previous similar business days
- **Real-time Calculations**: All metrics calculated in browser, no backend required
- **Automatic Analysis**: Generates executive summary and narrative insights

### Calculated Metrics
- **Historical Average**: Mean of previous 5 days per interval
- **Variance**: Today Actual - Historical Average
- **Variance %**: Pattern deviation percentage (key metric)
- **Cumulative Variance**: Running total throughout the day

### Output Columns
```
Time | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Historical Avg | Today Actual | Variance | Variance % | Cumulative Variance
```

### Visualizations
- **Historical vs Actual Volume**: Line chart comparing patterns
- **Variance % by Interval**: Bar chart highlighting deviations
- **Cumulative Variance**: Line chart showing pattern evolution

### Color-Coded Alerts
- 🟢 **Green** (-10% to +10%): Normal variance
- 🟡 **Yellow** (±10% to ±20%): Moderate deviation
- 🔴 **Red** (>±20%): Significant pattern distortion

## Installation

### Direct Use (Recommended)
1. Download all three files: `index.html`, `styles.css`, `script.js`
2. Keep them in the same directory
3. Open `index.html` in any modern web browser
4. **That's it!** The app works completely offline, no installation needed.

### Optional Web Server
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Then visit http://localhost:8000
```

## Usage

### Quick Start
1. **Load Sample Data**: Click "Load Sample Data" button to see a realistic example
2. **Review Metrics**: Examine the auto-calculated variance percentages
3. **Check Summary**: View period-level analysis (Morning/Midday/Late Day)
4. **Read Narrative**: Review the executive narrative for pattern insights

### Real World Usage

#### Step 1: Enter Historical Data
- Input volumes from previous 5 similar business days in columns "Day 1" through "Day 5"
- Example: For Tuesday analysis, use volumes from previous 5 Tuesdays
- Exclude holidays, system outages, or other anomalies from historical baseline

#### Step 2: Enter Today's Actual Volume
- Input actual volumes as they occur in "Today Actual" column
- Can be entered manually or populated via automated feed
- Update throughout the day for real-time monitoring

#### Step 3: Review Calculated Metrics
- **Historical Avg**: Automatically calculated from Days 1-5
- **Variance**: Shows volume difference (positive = excess, negative = deficit)
- **Variance %**: Key pattern deviation metric with color coding
- **Cumulative Variance**: Running total shows if gaps are compounding

#### Step 4: Analyze Results
- Check Executive Summary for period-level insights
- Review critical intervals (largest spike/dip)
- Read auto-generated narrative for operational context
- Export to CSV for archiving or further analysis

### Tips & Tricks
- **Quick Fill**: Click any input cell to select that column, then use "Quick Fill Selected Column" to populate all 56 rows
- **Clear Data**: Use "Clear All Data" button to reset and start fresh
- **Real-time Updates**: All metrics recalculate instantly as you enter data
- **No Save Required**: Data stays in browser until page refresh (by design)

## How It Works

### Architecture
- **Pure Vanilla JavaScript**: No frameworks, no dependencies, no build process
- **Client-Side Only**: All calculations run in your browser
- **Canvas Charts**: Custom visualizations using HTML5 Canvas API
- **Responsive Design**: Works on desktop, tablet, and mobile devices

### Calculation Logic
```javascript
// Core calculations performed per interval
historicalAvg = (day1 + day2 + day3 + day4 + day5) / 5
variance = todayActual - historicalAvg
variancePct = variance / historicalAvg
cumulativeVariance = runningTotal(variance)
```

### Summary Periods
- **Morning**: 9:00 AM - 12:00 PM (12 intervals)
- **Midday**: 12:00 PM - 3:00 PM (12 intervals)
- **Late Day**: 3:00 PM - 11:00 PM (32 intervals)

## Executive Narrative

The tool auto-generates a professional narrative explaining:

✓ **Period Analysis**: Where pattern deviation occurred (morning spike, midday dip, late-day surge)
✓ **Critical Intervals**: Specific times showing largest spike and dip
✓ **Volume Impact**: Cumulative variance assessment and pattern evolution
✓ **Key Insights**: Why pattern matters more than total volume
✓ **Recommendations**: Actionable next steps based on deviation patterns

## Technical Details

### Browser Compatibility
- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support
- ✅ Opera: Full support
- ❌ IE11: Not supported (requires ES6+)

### File Structure
```
/
├── index.html      # Application structure
├── styles.css      # Professional styling
├── script.js       # Calculations & charts
└── README.md       # Documentation
```

### Performance
- **Initial Load**: < 100ms
- **Data Entry**: Instant response
- **Chart Rendering**: < 50ms
- **Export CSV**: Instant download
- **Memory Usage**: < 5MB

### Data Privacy
- ✓ **No Server**: All data stays in your browser
- ✓ **No Tracking**: No analytics or external calls
- ✓ **No Storage**: Data clears on refresh (by design)
- ✓ **No Dependencies**: No CDN or third-party resources

## Understanding Pattern Deviation

### Why Pattern Matters More Than Total Volume

Contact centers often achieve accurate daily volume forecasts but still experience operational challenges. This occurs because **when** volume arrives matters as much as **how much** volume arrives.

**Example Scenario:**
```
Daily Forecast:  10,000 calls
Daily Actual:    10,000 calls  ✓ Perfect accuracy!

BUT the pattern was different:
                Forecast  Actual   Impact
Morning:          2,500   3,500   +1,000 spike
Midday:           3,000   2,000   -1,000 dip
Late Day:         4,500   4,500   Aligned

Result: Perfect volume forecast, but morning spike and midday dip 
        create operational misalignment despite total accuracy.
```

### Pattern Evolution Analysis

Monitor the **Cumulative Variance** chart to understand pattern evolution:

- **Improving** (trending toward zero): Deviations offsetting each other
- **Worsening** (trending away from zero): Variance compounding
- **Stable** (flat line): Consistent pattern distortion

### Color-Coded Variance Thresholds

The tool uses industry-standard variance thresholds:

| Color  | Range          | Interpretation                              |
|--------|----------------|---------------------------------------------|
| Green  | -10% to +10%   | Normal variance, within expected bounds     |
| Yellow | ±10% to ±20%   | Moderate deviation, monitor for trends      |
| Red    | > ±20%         | Significant distortion, requires attention  |

## Export Format

CSV export includes all calculated metrics:
```csv
Time,Day 1,Day 2,Day 3,Day 4,Day 5,Historical Avg,Today Actual,Variance,Variance %,Cumulative Variance
09:00 AM,120,125,118,122,121,121.20,135,13.80,11.38%,13.80
09:15 AM,115,118,120,117,119,117.80,125,7.20,6.11%,21.00
...
```

Perfect for:
- Weekly trend analysis
- Historical pattern archiving
- Integration with BI tools
- Management reporting

## Customization

### Modify Variance Thresholds

To adjust color-coding thresholds, edit `script.js`:

```javascript
function getDeviationClass(variancePct) {
    const absVar = Math.abs(variancePct);
    if (absVar <= 0.10) return 'deviation-green';    // Change 0.10 (10%)
    if (absVar <= 0.20) return 'deviation-yellow';   // Change 0.20 (20%)
    return 'deviation-red';
}
```

### Customize Styling

All colors defined as CSS variables in `styles.css`:

```css
:root {
    --primary-blue: #2563eb;      /* Main brand color */
    --accent-cyan: #06b6d4;       /* Accent highlights */
    --accent-red: #ef4444;        /* Alert/warning */
    --accent-green: #10b981;      /* Success/positive */
    --accent-amber: #f59e0b;      /* Caution/moderate */
}
```

Modify these to match your brand guidelines.

## Best Practices

### Data Quality
✓ Use consistent day types for historical baseline (Mon-Mon, Tue-Tue, etc.)
✓ Exclude anomalies: holidays, system outages, major campaigns
✓ Use recent history: last 5 similar days, not older patterns
✓ Verify data accuracy before analysis

### Analysis Workflow
✓ Run analysis daily to build pattern recognition capability
✓ Compare variance % trends across weeks to identify systematic shifts
✓ Archive weekly for longitudinal trend analysis
✓ Share Executive Summary with operations leadership
✓ Use critical intervals to inform schedule adjustments

### Interpretation Guidelines
✓ Focus on variance % (not absolute variance) for pattern assessment
✓ Consider cumulative variance trend, not just end-of-day total
✓ Investigate sustained deviations (3+ consecutive intervals)
✓ Distinguish random volatility from systematic pattern shifts

## Use Cases

### Operations Management
- **Real-time Monitoring**: Track today's pattern against historical baseline
- **Root Cause Analysis**: Identify when and where pattern deviations occur
- **Trend Detection**: Spot emerging pattern shifts before they become chronic

### Workforce Planning
- **Schedule Refinement**: Use critical intervals to adjust shift distributions
- **Forecast Validation**: Verify forecast pattern assumptions against actuals
- **Capacity Planning**: Understand where historical baselines need recalibration

### Performance Analysis
- **Pattern Forensics**: Understand why service levels failed despite volume accuracy
- **Comparative Analysis**: Benchmark similar day types for pattern consistency
- **Executive Reporting**: Communicate pattern deviation impact to leadership

## Troubleshooting

**Charts not rendering?**
- Ensure you have sample data loaded or data entered
- Check browser console for JavaScript errors
- Verify all three files (HTML, CSS, JS) are in same directory

**Calculations seem wrong?**
- Verify historical data (Days 1-5) is entered correctly
- Check that "Today Actual" values are populated
- Ensure no negative values (minimum is 0)

**Export not working?**
- Some browsers may block downloads; check browser settings
- Ensure pop-ups are not blocked
- Try right-click → Save As on the export link

## Support

This is a standalone tool requiring no backend infrastructure or external dependencies. All functionality runs entirely in the browser using modern web standards.

For questions or enhancements, review the well-commented source code in `script.js`. The code is intentionally straightforward and modifiable.

## Version History

**v2.0** - Simplified volume-only analysis
- Removed FTE calculations and staffing metrics
- Streamlined to pure pattern deviation analysis
- Improved executive narrative focus on volume patterns
- Updated table columns for clarity

**v1.0** - Initial release with FTE analysis

---

**Version**: 2.0  
**Last Updated**: February 2026  
**License**: Free to use for operational analysis  

*Pattern deviation matters more than total volume accuracy.*
