/**
 * Fetch Alpha Vantage fundamentals for a ticker through the Vercel proxy.
 * Returns { overview, earnings } or null if unavailable.
 */
export async function fetchAlphaVantageData(ticker, alphaVantageKey) {
  if (!alphaVantageKey) return null;

  try {
    const response = await fetch('/api/alphavantage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alphaVantageKey,
        ticker: ticker.toUpperCase().trim(),
      }),
    });

    if (!response.ok) {
      /* Silently degrade — AV data is optional */
      console.warn(`Alpha Vantage fetch failed (${response.status})`);
      return null;
    }

    const data = await response.json();
    return data.overview ? data : null;
  } catch (err) {
    console.warn('Alpha Vantage fetch error:', err.message);
    return null;
  }
}
