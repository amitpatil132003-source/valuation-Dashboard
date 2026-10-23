import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const publicDir = join(process.cwd(), 'public');
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function yahoo(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ValuationDashboard/1.0' } });
  if (!response.ok) throw new Error(response.status === 404 ? 'No matching listed company was found.' : 'The public market-data source is temporarily unavailable. Please retry.');
  return response.json();
}

function firstNumber(...values) {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;
}

async function companyData(query) {
  const candidate = query.trim().toUpperCase().includes('.')
    ? query.trim().toUpperCase()
    : `${query.trim().toUpperCase()}.NS`;
  let search;
  try {
    search = await yahoo(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`);
  } catch {
    search = { quotes: [] };
  }
  const selected = search.quotes?.find((item) => item.quoteType === 'EQUITY' && ['NSI', 'BSE'].includes(item.exchange))
    ?? search.quotes?.find((item) => item.symbol === candidate)
    ?? { symbol: candidate, shortname: candidate.replace(/\.(NS|BO)$/, ''), exchange: candidate.endsWith('.BO') ? 'BSE' : 'NSE' };
  let ticker = selected.symbol;
  let chart;
  try {
    chart = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5y&interval=1mo`);
  } catch (error) {
    const alternate = ticker.endsWith('.NS') ? ticker.replace('.NS', '.BO') : ticker.endsWith('.BO') ? ticker.replace('.BO', '.NS') : null;
    if (!alternate) throw error;
    try {
      chart = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(alternate)}?range=5y&interval=1mo`);
      ticker = alternate;
    } catch { throw new Error('Company not found. Try its exact NSE ticker, for example TCS, INFY, RELIANCE, or append .BO for BSE.'); }
  }
  const benchmarkChart = await yahoo('https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=5y&interval=1mo');
  const result = chart.chart?.result?.[0];
  if (!result) throw new Error('No price history was returned for this company.');
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const history = result.timestamp.map((time, index) => ({
    date: new Date(time * 1000).toISOString().slice(0, 10),
    close: closes[index]
  })).filter((point) => Number.isFinite(point.close));
  const benchmarkResult = benchmarkChart.chart?.result?.[0];
  const benchmarkCloses = benchmarkResult?.indicators?.quote?.[0]?.close ?? [];
  const benchmarkHistory = (benchmarkResult?.timestamp ?? []).map((time, index) => ({
    date: new Date(time * 1000).toISOString().slice(0, 10),
    close: benchmarkCloses[index]
  })).filter((point) => Number.isFinite(point.close));
  const price = firstNumber(result.meta?.regularMarketPrice, history.at(-1)?.close);
  let fundamentals = {};
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 6 * 365 * 24 * 60 * 60;
    const timeseries = await yahoo(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}?symbol=${encodeURIComponent(ticker)}&type=annualTotalRevenue,annualEBITDA,annualNetIncome,annualFreeCashFlow,annualDilutedAverageShares&period1=${start}&period2=${end}`);
    const rows = timeseries.timeseries?.result ?? [];
    const value = (key) => rows.find((row) => row[key])?.[key]?.at(-1)?.reportedValue?.raw ?? null;
    fundamentals = { revenue: value('annualTotalRevenue'), ebitda: value('annualEBITDA'), netIncome: value('annualNetIncome'), freeCashFlow: value('annualFreeCashFlow'), shares: value('annualDilutedAverageShares') };
  } catch {
    // Price data remains useful when the optional fundamentals endpoint is unavailable.
  }
  return {
    ticker,
    name: selected.longname ?? selected.shortname ?? ticker,
    exchange: selected.exchange === 'BSE' ? 'BSE' : 'NSE',
    currency: result.meta?.currency ?? 'INR',
    price,
    marketCap: selected.marketCap ?? (fundamentals.shares && price ? fundamentals.shares * price : null),
    history,
    benchmarkHistory,
    fundamentals,
    source: 'Yahoo Finance public market data',
    asOf: new Date().toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/company') {
    const query = url.searchParams.get('q');
    if (!query) return json(res, 400, { error: 'Enter a company name or NSE/BSE ticker.' });
    try { return json(res, 200, await companyData(query)); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  const requested = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
  const file = join(publicDir, requested);
  if (!file.startsWith(publicDir)) return res.end('Not found');
  try {
    const content = await readFile(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});

server.listen(3000, () => console.log('Open http://localhost:3000'));
