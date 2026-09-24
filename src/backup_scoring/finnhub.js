/**
 * Fetch all Finnhub data for a ticker through the Vercel proxy.
 * Returns { profile, quote, recommendation, news }.
 */
export async function fetchTickerData(ticker, finnhubKey) {
  const response = await fetch('/api/finnhub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      finnhubKey,
      ticker: ticker.toUpperCase().trim(),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || `Failed to fetch Finnhub data (${response.status})`
    );
  }

  return response.json();
}
