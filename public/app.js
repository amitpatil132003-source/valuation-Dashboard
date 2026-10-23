const $ = (id) => document.getElementById(id);
const inputs = ['revenue', 'ebitdaMargin', 'fcfMargin', 'growth', 'years', 'wacc', 'terminalGrowth', 'netDebt'].map($);
let company;
let uploaded = null;
let sharedState = null;
let acquirer = null;
const maInputs = ['premium', 'cashMix', 'stockMix', 'debtMix', 'transactionCosts', 'integrationCosts', 'costSynergies', 'revenueSynergies', 'synergyMargin', 'synergyYears'].map($);

const inr = (value, digits = 0) => Number.isFinite(value) ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}` : '—';
const crore = (value) => Number.isFinite(value) ? `₹${(value / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : 'Not available';
const percent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const input = (id) => Number($(id).value) || 0;
const unitScale = () => ({ crore: 1, lakh: .01, rupee: .0000001 })[$('uploadUnit').value];
const storedProjects = () => JSON.parse(localStorage.getItem('valuelens-projects') || '[]');
const saveProjects = (projects) => localStorage.setItem('valuelens-projects', JSON.stringify(projects));

const regressionBeta = (stock, benchmark) => {
  const market = new Map(benchmark.map((item) => [item.date, item.close]));
  const pairs = stock.map((item, index) => index ? [item.close / stock[index - 1].close - 1, market.get(item.date)] : null)
    .filter((pair) => pair && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  const returns = pairs.map(([stockReturn, marketClose], index) => index ? [stockReturn, marketClose / pairs[index - 1][1] - 1] : null).filter(Boolean);
  if (returns.length < 12) return 1;
  const stockMean = returns.reduce((sum, pair) => sum + pair[0], 0) / returns.length;
  const marketMean = returns.reduce((sum, pair) => sum + pair[1], 0) / returns.length;
  const covariance = returns.reduce((sum, pair) => sum + (pair[0] - stockMean) * (pair[1] - marketMean), 0);
  const variance = returns.reduce((sum, pair) => sum + (pair[1] - marketMean) ** 2, 0);
  return variance ? Math.max(0.2, Math.min(3, covariance / variance)) : 1;
};

const rowNumbers = (row) => row.slice(1).map((value) => typeof value === 'number' ? value : Number(String(value).replace(/[,₹%]/g, ''))).filter(Number.isFinite);
const findMetric = (rows, names) => rows.find((row) => names.some((name) => String(row[0]).toLowerCase().includes(name))) || [];
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const cagr = (values) => values.length > 1 && values[0] > 0 ? ((values.at(-1) / values[0]) ** (1 / (values.length - 1)) - 1) * 100 : null;

function renderSensitivity() {
  const table = (rowLabel, rows, colLabel, cols, value) => `<table><thead><tr><th>${rowLabel} \\ ${colLabel}</th>${cols.map((v) => `<th>${v.toFixed(1)}%</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><th>${row.toFixed(1)}%</th>${cols.map((col) => { const result = value(row, col); const base = Math.abs(row - input('wacc')) < .01 && Math.abs(col - input('terminalGrowth')) < .01; return `<td class="${base ? 'base-cell' : ''}">${inr(result, 0)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  const waccs = [-2, -1, 0, 1, 2].map((n) => input('wacc') + n);
  const terminals = [-1, -.5, 0, .5, 1].map((n) => Math.max(0, input('terminalGrowth') + n));
  $('waccSensitivity').innerHTML = table('WACC', waccs, 'Terminal growth', terminals, (wacc, terminal) => calculate({ wacc, terminal }));
  const growths = [-4, -2, 0, 2, 4].map((n) => input('growth') + n);
  const conversions = [-10, -5, 0, 5, 10].map((n) => Math.max(1, Math.min(100, input('fcfMargin') + n)));
  $('conversionSensitivity').innerHTML = table('Growth', growths, 'FCFF/EBITDA', conversions, (growth, conversion) => calculate({ growth, conversion }));
}

function renderProjects() {
  const projects = storedProjects();
  $('projectList').innerHTML = projects.length ? projects.map((project, index) => `<article><div><strong>${project.name}</strong><small>${project.ticker} · saved ${new Date(project.savedAt).toLocaleString('en-IN')}</small></div><div><button data-open="${index}">Open</button> <button data-delete="${index}">Delete</button></div></article>`).join('') : '<p class="hint">No saved projects on this device.</p>';
}

const guideTerms = [
  ['Market price', 'The latest price at which one share is trading in the stock market.'],
  ['Market cap', 'The market value of all shares. It is current share price multiplied by total shares outstanding.'],
  ['Equity value', 'The value left for shareholders after debt is considered. The DCF equity value is the model estimate of this amount.'],
  ['Enterprise value', 'The value of the operating business before considering how it is financed by debt or cash.'],
  ['Revenue', 'Sales earned by the company before subtracting expenses.'],
  ['EBITDA', 'A measure of operating profit before interest, tax, depreciation and amortisation. It helps compare operating performance.'],
  ['EBITDA margin', 'EBITDA divided by revenue. It shows how much operating profit is produced from each rupee of sales.'],
  ['FCFF', 'Free cash flow to the firm. It is cash generated for both lenders and shareholders after running and reinvesting in the business.'],
  ['FCFF / EBITDA conversion', 'The portion of EBITDA that becomes free cash flow. A lower figure can indicate higher taxes, capital spending or working-capital needs.'],
  ['DCF', 'Discounted cash flow valuation. It estimates today’s value from the cash the business may generate in future.'],
  ['WACC', 'Weighted average cost of capital. It is the return required by the company’s lenders and shareholders, used to discount future cash flows.'],
  ['Terminal growth', 'The long-term annual growth assumed after the detailed forecast period. It should normally be conservative.'],
  ['Bear, base and bull cases', 'Three sets of assumptions: cautious, expected and optimistic. They show a range of possible values rather than a single certainty.'],
  ['Acquisition premium', 'The extra amount offered above the target company’s current market value to persuade its shareholders to sell.'],
  ['Synergy', 'Additional value expected when two companies combine, such as lower costs or extra revenue.'],
  ['Accretion / dilution', 'Whether a merger increases or reduces the acquirer’s earnings per share after the deal.'],
  ['Due diligence', 'A structured review of financial, legal, operational and other risks before completing a transaction.']
];
function renderGuide() { $('guideGrid').innerHTML = guideTerms.map(([term, definition]) => `<details><summary>${term}</summary><p>${definition}</p></details>`).join(''); }

function selectTab(tab) {
  document.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  document.querySelectorAll('nav [data-tab]').forEach((link) => link.classList.toggle('active', link.dataset.tab === tab));
}

function maInput(id) { return Number($(id).value) || 0; }
function cr(value) { return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`; }
function dealData() {
  if (!company || !acquirer) return null;
  const targetCap = (company.marketCap || company.price * (company.fundamentals.shares || 0)) / 1e7;
  const acquirerCap = (acquirer.marketCap || acquirer.price * (acquirer.fundamentals.shares || 0)) / 1e7;
  const offerEquity = targetCap * (1 + maInput('premium') / 100);
  const transactionCosts = maInput('transactionCosts'), integration = maInput('integrationCosts');
  const cash = offerEquity * maInput('cashMix') / 100, stock = offerEquity * maInput('stockMix') / 100, debt = offerEquity * maInput('debtMix') / 100;
  const fundingTotal = cash + stock + debt;
  const synergyPreTax = maInput('costSynergies') + maInput('revenueSynergies') * maInput('synergyMargin') / 100;
  const taxRate = .25, wacc = maInput('wacc') / 100, years = maInput('synergyYears');
  const synergyAfterTax = synergyPreTax * (1 - taxRate);
  const synergyNpv = Array.from({ length: years }, (_, index) => synergyAfterTax * Math.min(1, (index + 1) / years) / (1 + wacc) ** (index + 1)).reduce((sum, value) => sum + value, 0) - integration;
  const targetNetIncome = (company.fundamentals.netIncome || 0) / 1e7;
  const acquirerNetIncome = (acquirer.fundamentals.netIncome || 0) / 1e7;
  const acquirerShares = acquirer.fundamentals.shares || (acquirerCap * 1e7 / acquirer.price);
  const newShares = stock * 1e7 / acquirer.price;
  const debtCostAfterTax = debt * .09 * (1 - taxRate);
  const standaloneEps = acquirerNetIncome * 1e7 / acquirerShares;
  const proFormaEps = (acquirerNetIncome + targetNetIncome + synergyAfterTax - debtCostAfterTax) * 1e7 / (acquirerShares + newShares);
  return { targetCap, acquirerCap, offerEquity, transactionValue: offerEquity + transactionCosts, cash, stock, debt, fundingTotal, synergyPreTax, synergyAfterTax, synergyNpv, valueCreated: synergyNpv - transactionCosts, standaloneEps, proFormaEps, accretion: standaloneEps ? (proFormaEps / standaloneEps - 1) * 100 : null };
}
function renderDeal() {
  const deal = dealData();
  if (!deal) return;
  const mixWarning = Math.abs(deal.fundingTotal - deal.offerEquity) > 1;
  $('dealMetrics').innerHTML = [
    ['Target market cap', cr(deal.targetCap)], ['Offer equity value', cr(deal.offerEquity)], ['Transaction value', cr(deal.transactionValue)], ['Synergy NPV', cr(deal.synergyNpv)], ['Value created / destroyed', cr(deal.valueCreated)], ['Funding total', cr(deal.fundingTotal)]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('accretionMetrics').innerHTML = [['Acquirer EPS', inr(deal.standaloneEps, 2)], ['Pro forma EPS', inr(deal.proFormaEps, 2)], ['Accretion / dilution', deal.accretion === null ? 'n.a.' : percent(deal.accretion)], ['New shares issued', (deal.stock * 1e7 / acquirer.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })]].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('maNote').textContent = `${mixWarning ? 'Financing mix does not equal 100%; ' : ''}Synergy value assumes a ${yearsLabel(maInput('synergyYears'))} ramp-up, 25.0% tax rate, and the active ${input('wacc').toFixed(1)}% WACC. Values are illustrative, not a fairness opinion.`;
  const risks = [...document.querySelectorAll('#riskChecklist input:checked')].map((box) => box.dataset.risk);
  $('maReportText').textContent = `${acquirer.name} is evaluating ${company.name}. The model uses a ${maInput('premium').toFixed(1)}% acquisition premium, implying transaction value of ${cr(deal.transactionValue)} and synergy NPV of ${cr(deal.synergyNpv)}. The projected EPS effect is ${deal.accretion === null ? 'unavailable' : percent(deal.accretion)}. Due diligence completed: ${risks.length ? risks.join('; ') : 'none recorded'}.`;
}
function yearsLabel(years) { return `${years} year${years === 1 ? '' : 's'}`; }

function renderChart(history) {
  const closes = history.map((item) => item.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const height = 190, width = 760, padding = 34;
  const point = (value, index) => `${padding + index * (width - padding * 2) / Math.max(1, closes.length - 1)},${height - padding - (value - min) / (max - min || 1) * (height - padding * 2)}`;
  const last = point(closes.at(-1), closes.length - 1).split(',');
  $('chart').style.display = 'block';
  $('chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-label="Price line chart"><line class="axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"/><text x="0" y="${padding}">${inr(max, 0)}</text><text x="0" y="${height - padding}">${inr(min, 0)}</text><polyline class="actual" points="${closes.map(point).join(' ')}"/><circle class="dot-actual" cx="${last[0]}" cy="${last[1]}" r="5"/><text x="${Number(last[0]) - 18}" y="${Number(last[1]) - 10}">${inr(closes.at(-1), 2)}</text></svg>`;
}

function renderModelChart() {
  const actual = uploaded?.freeCashFlow?.length ? uploaded.freeCashFlow : (company.fundamentals.freeCashFlow ? [company.fundamentals.freeCashFlow / 1e7] : [input('revenue') * input('ebitdaMargin') / 100 * input('fcfMargin') / 100]);
  const forecast = Array.from({ length: input('years') }, (_, index) => input('revenue') * input('ebitdaMargin') / 100 * input('fcfMargin') / 100 * (1 + input('growth') / 100) ** (index + 1));
  const all = [...actual, ...forecast], min = Math.min(0, ...all), max = Math.max(...all), width = 820, height = 260, pad = 38;
  const x = (index) => pad + index * (width - pad * 2) / Math.max(1, all.length - 1);
  const y = (value) => height - pad - (value - min) / (max - min || 1) * (height - pad * 2);
  const actualPoints = actual.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const forecastPoints = [actual.at(-1), ...forecast].map((value, index) => `${x(actual.length - 1 + index)},${y(value)}`).join(' ');
  const finalX = x(all.length - 1), finalY = y(all.at(-1));
  $('modelChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}"><line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/><line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/><text x="0" y="${pad}">₹${max.toFixed(0)} Cr</text><text x="0" y="${height - pad}">₹${min.toFixed(0)} Cr</text><polyline class="actual" points="${actualPoints}"/><polyline class="forecast" points="${forecastPoints}"/><circle class="dot-actual" cx="${x(actual.length - 1)}" cy="${y(actual.at(-1))}" r="5"/><circle class="dot-forecast" cx="${finalX}" cy="${finalY}" r="5"/><text x="${finalX - 30}" y="${finalY - 10}">₹${all.at(-1).toFixed(0)} Cr</text><text x="${pad}" y="${height - 10}">Actual</text><text x="${x(actual.length) + 10}" y="${height - 10}">Forecast</text></svg>`;
}

function renderForecastChart(bear, base, bull) {
  const current = company.price, min = Math.min(current, bear) * .9, max = Math.max(current, bull) * 1.08, width = 820, height = 210, pad = 42;
  const y = (value) => height - pad - (value - min) / (max - min || 1) * (height - pad * 2);
  const startX = width * .42, endX = width - pad, currentY = y(current);
  $('forecastCurrent').textContent = inr(current, 2); $('forecastBase').textContent = inr(base, 2);
  $('forecastChange').textContent = `${percent((base / current - 1) * 100)} vs today`;
  $('forecastBear').textContent = inr(bear, 2); $('forecastBaseLabel').textContent = inr(base, 2); $('forecastBull').textContent = inr(bull, 2);
  $('forecastChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}"><line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/><text x="0" y="${pad}">${inr(max, 0)}</text><text x="0" y="${height - pad}">${inr(min, 0)}</text><path class="band" d="M ${startX} ${currentY} L ${endX} ${y(bull)} L ${endX} ${y(bear)} Z"/><line class="edge" x1="${startX}" y1="${currentY}" x2="${endX}" y2="${y(bull)}"/><line class="edge" x1="${startX}" y1="${currentY}" x2="${endX}" y2="${y(bear)}"/><line class="base" x1="${startX}" y1="${currentY}" x2="${endX}" y2="${y(base)}"/><circle class="now" cx="${startX}" cy="${currentY}" r="5"/><text x="${startX - 27}" y="${currentY - 10}">Today</text><text x="${endX - 40}" y="${y(bull) - 8}">High</text><text x="${endX - 40}" y="${y(base) - 8}">Base</text><text x="${endX - 40}" y="${y(bear) + 16}">Low</text></svg>`;
}

function renderRatios() {
  const revenue = (uploaded?.revenue?.at(-1) || company.fundamentals.revenue / 1e7 || input('revenue'));
  const ebitda = (uploaded?.ebitda?.at(-1) || company.fundamentals.ebitda / 1e7 || revenue * input('ebitdaMargin') / 100);
  const fcf = (uploaded?.freeCashFlow?.at(-1) || company.fundamentals.freeCashFlow / 1e7 || ebitda * input('fcfMargin') / 100);
  const netIncome = company.fundamentals.netIncome / 1e7;
  const cap = company.marketCap ? company.marketCap / 1e7 : null;
  const historicalGrowth = uploaded?.revenue?.length ? cagr(uploaded.revenue) : null;
  const cards = [
    ['FCFF / EBITDA', `${(fcf / ebitda * 100).toFixed(1)}%`, 'Latest FCFF ÷ latest EBITDA'],
    ['EBITDA margin', `${(ebitda / revenue * 100).toFixed(1)}%`, 'Latest EBITDA ÷ latest revenue'],
    ['Net margin', netIncome && revenue ? `${(netIncome / revenue * 100).toFixed(1)}%` : 'n.a.', 'Net income ÷ latest revenue'],
    ['Revenue CAGR', historicalGrowth !== null ? `${historicalGrowth.toFixed(1)}%` : 'n.a.', 'From uploaded historical revenue'],
    ['Price / sales', cap && revenue ? `${(cap / revenue).toFixed(1)}×` : 'n.a.', 'Market cap ÷ latest revenue'],
    ['Price / free cash flow', cap && fcf ? `${(cap / fcf).toFixed(1)}×` : 'n.a.', 'Market cap ÷ latest free cash flow'],
    ['Market cap', cap ? `₹${cap.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : 'n.a.', 'Latest price × shares outstanding'],
    ['WACC', `${input('wacc').toFixed(1)}%`, 'Editable discount rate'],
    ['DCF upside', percent((calculate() / company.price - 1) * 100), 'Base-case value vs latest price']
  ];
  $('ratioGrid').innerHTML = cards.map(([name, value, detail]) => `<article><span>${name}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
}

function calculate(overrides = {}) {
  const revenue = overrides.revenue ?? input('revenue');
  const ebitdaMargin = (overrides.ebitdaMargin ?? input('ebitdaMargin')) / 100;
  const conversion = (overrides.conversion ?? input('fcfMargin')) / 100;
  const growth = (overrides.growth ?? input('growth')) / 100;
  const years = input('years');
  const rate = (overrides.wacc ?? input('wacc')) / 100;
  const terminal = (overrides.terminal ?? input('terminalGrowth')) / 100;
  const netDebt = input('netDebt') * 1e7;
  const shares = company.fundamentals.shares || (company.marketCap && company.price ? company.marketCap / company.price : 1e9);
  let presentValue = 0;
  for (let year = 1; year <= years; year += 1) {
    const cashFlow = revenue * 1e7 * ebitdaMargin * conversion * (1 + growth) ** year;
    presentValue += cashFlow / (1 + rate) ** year;
  }
  const terminalCashFlow = revenue * 1e7 * ebitdaMargin * conversion * (1 + growth) ** years * (1 + terminal);
  const terminalValue = terminalCashFlow / Math.max(rate - terminal, 0.01);
  const equityValue = presentValue + terminalValue / (1 + rate) ** years - netDebt;
  return Math.max(0, equityValue / shares);
}

function refresh() {
  if (!company) return;
  const base = calculate();
  const upside = (base / company.price - 1) * 100;
  const status = upside >= 0 ? 'Potentially undervalued' : 'Potentially overvalued';
  $('intrinsicValue').textContent = inr(base, 2);
  $('marketPrice').textContent = inr(company.price, 2);
  $('marginSafety').textContent = percent(upside);
  const shares = company.fundamentals.shares || (company.marketCap && company.price ? company.marketCap / company.price : 0);
  $('valuationMarketCap').textContent = company.marketCap ? crore(company.marketCap) : 'n.a.';
  $('valuationEquityValue').textContent = shares ? crore(base * shares) : 'n.a.';
  $('valuationStatus').textContent = status;
  $('valuationStatus').className = `pill ${upside < 0 ? 'over' : ''}`;
  $('valueBar').style.width = `${Math.min(100, Math.max(8, (base / company.price) * 55))}%`;
  const scenarios = [
    ['Bear', calculate({ growth: input('growth') - 4, conversion: Math.max(1, input('fcfMargin') - 8), wacc: input('wacc') + 1.5 })],
    ['Base', base],
    ['Bull', calculate({ growth: input('growth') + 3, conversion: Math.min(100, input('fcfMargin') + 8), wacc: Math.max(1, input('wacc') - 1) })]
  ];
  $('scenarios').innerHTML = scenarios.map(([name, value]) => `<div><span>${name}</span><b>${inr(value, 2)}</b></div>`).join('');
  $('reportConclusion').textContent = status;
  $('reportSentence').textContent = `${company.name} is trading at ${inr(company.price, 2)} versus a base-case DCF estimate of ${inr(base, 2)} per share (${percent(upside)}). This is an assumption-driven research estimate, not a recommendation.`;
  $('reportValue').textContent = inr(base, 2);
  $('reportUpside').textContent = `${percent(upside)} to latest price`;
  $('reportAssumptions').innerHTML = [
    `Revenue: ₹${input('revenue').toLocaleString('en-IN')} Cr`,
    `Revenue growth: ${input('growth').toFixed(1)}% for ${input('years')} years`,
    `EBITDA margin: ${input('ebitdaMargin').toFixed(1)}%; FCFF / EBITDA conversion: ${input('fcfMargin').toFixed(1)}%`,
    `Discount rate: ${input('wacc').toFixed(1)}%; terminal growth: ${input('terminalGrowth').toFixed(1)}%`
  ].map((item) => `<li>${item}</li>`).join('');
  renderModelChart();
  renderRatios();
  renderForecastChart(scenarios[0][1], base, scenarios[2][1]);
  renderSensitivity();
}

function display(data) {
  company = data;
  $('dashboard').hidden = false;
  $('companyName').textContent = data.name;
  $('reportName').textContent = `${data.name} — valuation report`;
  $('ticker').textContent = data.ticker;
  $('exchange').textContent = `${data.exchange} EQUITY`;
  $('currentPrice').textContent = inr(data.price, 2);
  $('asOf').textContent = `Data checked ${new Date(data.asOf).toLocaleDateString('en-IN')}`;
  $('reportDate').textContent = `Prepared ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const revenue = data.fundamentals.revenue ? data.fundamentals.revenue / 1e7 : Math.max(100, ((data.marketCap || data.price * 1e9) / 1e7) * 0.15);
  $('revenue').value = Math.round(revenue);
  if (data.fundamentals.ebitda && data.fundamentals.revenue) $('ebitdaMargin').value = Math.max(1, Math.min(80, data.fundamentals.ebitda / data.fundamentals.revenue * 100)).toFixed(1);
  if (data.fundamentals.freeCashFlow && data.fundamentals.ebitda) $('fcfMargin').value = Math.max(1, Math.min(100, data.fundamentals.freeCashFlow / data.fundamentals.ebitda * 100)).toFixed(1);
  const beta = regressionBeta(data.history, data.benchmarkHistory || []);
  const riskFree = 7, marketRiskPremium = 6;
  $('wacc').value = (riskFree + beta * marketRiskPremium).toFixed(1);
  $('waccNote').textContent = `Market-data estimate: ${beta.toFixed(2)} five-year monthly beta vs Nifty 50, ${riskFree.toFixed(1)}% risk-free rate, and ${marketRiskPremium.toFixed(1)}% equity-risk premium. Upload history to include debt and tax.`;
  $('figures').innerHTML = [
    ['Market cap', data.marketCap ? crore(data.marketCap) : 'Not available'],
    ['Annual revenue', crore(data.fundamentals.revenue)],
    ['Annual EBITDA', crore(data.fundamentals.ebitda)],
    ['Free cash flow', crore(data.fundamentals.freeCashFlow)],
    ['Net income', crore(data.fundamentals.netIncome)],
    ['Data currency', data.currency]
  ].map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('');
  $('reportSnapshot').innerHTML = [
    `${data.exchange} ticker: ${data.ticker}`,
    `Latest price: ${inr(data.price, 2)}`,
    `Market capitalisation: ${data.marketCap ? crore(data.marketCap) : 'not returned'}`,
    `Free cash flow: ${crore(data.fundamentals.freeCashFlow)}`
  ].map((item) => `<li>${item}</li>`).join('');
  $('reportSource').textContent = `Data source: ${data.source}. Price data date: ${new Date(data.asOf).toLocaleDateString('en-IN')}. Figures may be delayed, incomplete, or adjusted; verify against company filings.`;
  const targetCap = (data.marketCap || data.price * (data.fundamentals.shares || 0)) / 1e7;
  $('targetSummary').innerHTML = `<strong>${data.name}</strong><br>${data.ticker} · ${cr(targetCap)} market cap`;
  if (sharedState) {
    Object.entries(sharedState).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
    sharedState = null;
  }
  renderChart(data.history);
  refresh();
  renderDeal();
  $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('searchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('searchInput').value.trim();
  $('status').textContent = 'Fetching public NSE/BSE market data…';
  try {
    const response = await fetch(`/api/company?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load this company.');
    display(data); $('status').textContent = '';
  } catch (error) { $('status').textContent = error.message; }
});

$('financialUpload').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!window.XLSX) { $('uploadStatus').textContent = 'Spreadsheet reader could not load. Check your internet connection and retry.'; return; }
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = workbook.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }));
    const revenueRow = findMetric(rows, ['sales', 'revenue']); const revenue = rowNumbers(revenueRow).map((v) => v * unitScale());
    const operatingRow = findMetric(rows, ['cash from operating', 'cash flow from operating', 'net cash flow from operating']); const operatingCashFlow = rowNumbers(operatingRow).map((v) => v * unitScale());
    const capexRow = findMetric(rows, ['fixed assets purchased', 'purchase of fixed assets', 'capital expenditure', 'capex']); const capex = rowNumbers(capexRow).map((v) => v * unitScale());
    const ebitdaRow = findMetric(rows, ['ebitda', 'operating profit']); const ebitda = rowNumbers(ebitdaRow).map((v) => v * unitScale());
    const fcfRow = findMetric(rows, ['free cash flow']); const statedFreeCashFlow = rowNumbers(fcfRow).map((v) => v * unitScale());
    const freeCashFlow = statedFreeCashFlow.length ? statedFreeCashFlow : (operatingCashFlow.length && capex.length ? operatingCashFlow.map((value, index) => value - Math.abs(capex[index] ?? 0)) : operatingCashFlow);
    const borrowings = rowNumbers(findMetric(rows, ['borrowings', 'total debt'])).map((v) => v * unitScale());
    const interest = rowNumbers(findMetric(rows, ['interest'])).map((v) => v * unitScale());
    const tax = rowNumbers(findMetric(rows, ['tax'])).map((v) => v * unitScale());
    const profitBeforeTax = rowNumbers(findMetric(rows, ['profit before tax', 'pbt'])).map((v) => v * unitScale());
    if (revenue.length < 2) throw new Error('No multi-year Sales or Revenue row was found. Export the Screener financial statement with annual columns.');
    uploaded = { revenue, ebitda, freeCashFlow, borrowings, interest, tax, profitBeforeTax, fileName: file.name };
    $('revenue').value = Math.round(revenue.at(-1));
    const historicalGrowth = cagr(revenue);
    if (historicalGrowth !== null) $('growth').value = Math.max(-20, Math.min(50, historicalGrowth)).toFixed(1);
    if (ebitda.length && revenue.length) {
      $('ebitdaMargin').value = Math.max(1, Math.min(80, ebitda.at(-1) / revenue.at(-1) * 100)).toFixed(1);
    }
    if (freeCashFlow.length && ebitda.length) {
      $('fcfMargin').value = Math.max(1, Math.min(100, freeCashFlow.at(-1) / ebitda.at(-1) * 100)).toFixed(1);
    }
    if (company) {
      const beta = regressionBeta(company.history, company.benchmarkHistory || []);
      const debt = average(borrowings) || 0, equity = (company.marketCap || company.price * (company.fundamentals.shares || 1e9)) / 1e7;
      const taxRate = tax.length && profitBeforeTax.length ? Math.max(0, Math.min(.35, Math.abs(average(tax)) / Math.abs(average(profitBeforeTax)))) : .25;
      const costOfDebt = interest.length && debt ? Math.max(.03, Math.min(.2, Math.abs(average(interest)) / debt)) : .09;
      const wacc = ((equity / (equity + debt)) * (0.07 + beta * 0.06) + (debt / (equity + debt)) * costOfDebt * (1 - taxRate)) * 100;
      $('wacc').value = wacc.toFixed(1);
      $('waccNote').textContent = `Calculated from ${beta.toFixed(2)} Nifty beta, uploaded average debt/interest/tax history, and current market equity. You can still edit it.`;
    }
    $('uploadStatus').textContent = `${file.name}: ${revenue.length} annual periods imported as ₹ crore. Fiscal year ending ${$('fiscalEnd').value}; verify the preview before relying on the model.`;
    refresh();
  } catch (error) { $('uploadStatus').textContent = error.message; }
});

$('shareButton').addEventListener('click', async () => {
  if (!company) return;
  const state = Object.fromEntries(inputs.map((element) => [element.id, element.value]));
  const link = `${location.origin}${location.pathname}?model=${encodeURIComponent(btoa(JSON.stringify({ ticker: company.ticker, state })))}#report`;
  try { await navigator.clipboard.writeText(link); $('shareStatus').textContent = 'Model link copied. It reopens the ticker and assumptions, but does not include your uploaded financial file.'; }
  catch { $('shareStatus').textContent = link; }
});

$('peerButton').addEventListener('click', async () => {
  const tickers = $('peerInput').value.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 5);
  if (!tickers.length) { $('peerStatus').textContent = 'Enter at least one NSE or BSE ticker.'; return; }
  $('peerStatus').textContent = 'Fetching peer data…';
  const requests = await Promise.all(tickers.map(async (ticker) => {
    const response = await fetch(`/api/company?q=${encodeURIComponent(ticker)}`);
    return response.ok ? response.json() : null;
  }));
  const rows = [company, ...requests.filter(Boolean)].filter(Boolean);
  $('peerTable').querySelector('tbody').innerHTML = rows.map((item) => {
    const revenue = item.fundamentals.revenue / 1e7, ebitda = item.fundamentals.ebitda / 1e7, fcf = item.fundamentals.freeCashFlow / 1e7;
    return `<tr><td>${item.name} <small>(${item.ticker})</small></td><td>${inr(item.price, 0)}</td><td>${item.marketCap ? crore(item.marketCap) : 'n.a.'}</td><td>${Number.isFinite(revenue) ? `₹${revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : 'n.a.'}</td><td>${Number.isFinite(ebitda) && revenue ? `${(ebitda / revenue * 100).toFixed(1)}%` : 'n.a.'}</td><td>${Number.isFinite(fcf) && ebitda ? `${(fcf / ebitda * 100).toFixed(1)}%` : 'n.a.'}</td></tr>`;
  }).join('');
  $('peerStatus').textContent = `${rows.length} companies compared, including the selected company.`;
});

$('saveProject').addEventListener('click', () => {
  if (!company) return;
  const name = $('projectName').value.trim() || `${company.ticker} valuation`;
  const project = { name, ticker: company.ticker, state: Object.fromEntries(inputs.map((element) => [element.id, element.value])), savedAt: new Date().toISOString() };
  saveProjects([project, ...storedProjects()].slice(0, 25)); $('projectName').value = ''; renderProjects();
});

$('projectList').addEventListener('click', (event) => {
  const open = event.target.dataset.open, remove = event.target.dataset.delete, projects = storedProjects();
  if (open !== undefined) { const project = projects[open]; sharedState = project.state; $('searchInput').value = project.ticker; $('searchForm').requestSubmit(); }
  if (remove !== undefined) { projects.splice(remove, 1); saveProjects(projects); renderProjects(); }
});

$('loadAcquirer').addEventListener('click', async () => {
  const query = $('acquirerInput').value.trim();
  if (!query) { $('acquirerSummary').textContent = 'Enter an NSE/BSE ticker for the acquirer.'; return; }
  $('acquirerSummary').textContent = 'Loading acquirer…';
  try {
    const response = await fetch(`/api/company?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Acquirer could not be loaded.');
    acquirer = data;
    const cap = (data.marketCap || data.price * (data.fundamentals.shares || 0)) / 1e7;
    $('acquirerSummary').innerHTML = `<strong>${data.name}</strong><br>${data.ticker} · ${cr(cap)} market cap`;
    renderDeal();
  } catch (error) { $('acquirerSummary').textContent = error.message; }
});

$('riskChecklist').addEventListener('change', renderDeal);
$('printMa').addEventListener('click', () => window.print());
maInputs.forEach((element) => element.addEventListener('input', renderDeal));

document.querySelector('nav').addEventListener('click', (event) => {
  const link = event.target.closest('[data-tab]');
  if (!link) return;
  event.preventDefault();
  selectTab(link.dataset.tab);
  history.replaceState(null, '', `#${link.dataset.tab}`);
});

const shared = new URLSearchParams(location.search).get('model');
if (shared) {
  try {
    const saved = JSON.parse(atob(shared));
    sharedState = saved.state || {};
    $('searchInput').value = saved.ticker;
    $('searchForm').requestSubmit();
  } catch { /* Ignore an invalid shared link. */ }
}
inputs.forEach((element) => element.addEventListener('input', () => { refresh(); renderDeal(); }));
renderProjects();
renderGuide();
selectTab(location.hash.slice(1) || 'overview');
