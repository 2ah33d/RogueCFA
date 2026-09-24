import { fetchTickerData } from './finnhub';

const HISTORY_KEY = 'roguecfa_history';

const HOLD_PERIOD_DAYS = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 1095,
};

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Safely load history from localStorage without crashing on corrupt/missing data.
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.warn('Failed to parse roguecfa_history from localStorage:', err.message);
    return [];
  }
}

/**
 * Safely save history array to localStorage.
 */
export function saveHistory(historyArray) {
  try {
    if (!Array.isArray(historyArray)) return;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyArray));
  } catch (err) {
    console.warn('Failed to save roguecfa_history to localStorage:', err.message);
  }
}

/**
 * Clear all scoring history.
 */
export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (err) {
    console.warn('Failed to clear roguecfa_history from localStorage:', err.message);
  }
}

/**
 * Save a newly scored ticker to history.
 */
export function saveScoreToHistory(scorecard, holdPeriod = '6M') {
  try {
    const history = getHistory();
    const now = new Date();
    const daysToAdd = HOLD_PERIOD_DAYS[holdPeriod] || 180;
    const targetDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const priceAtScore = scorecard.entryPrice != null ? Number(scorecard.entryPrice) : null;

    const newEntry = {
      id: generateUUID(),
      ticker: (scorecard.ticker || '').toUpperCase(),
      companyName: scorecard.companyName || scorecard.ticker || 'Unknown',
      date: scorecard.scoredAt || now.toISOString(),
      priceAtScore: priceAtScore != null && !isNaN(priceAtScore) ? priceAtScore : 0,
      score: scorecard.score != null ? Number(scorecard.score) : 0,
      grade: scorecard.grade || 'N/A',
      signal: scorecard.signal || 'WATCH',
      holdPeriod: holdPeriod,
      targetDate: targetDate.toISOString(),
      outcome: null,
      scorecardData: scorecard,
    };

    const updated = [newEntry, ...history];
    saveHistory(updated);
    return newEntry;
  } catch (err) {
    console.warn('Failed to save score to history:', err.message);
    return null;
  }
}

/**
 * Resolve outcomes for expired history items where targetDate <= today.
 */
export async function resolveOutcomes(finnhubKey) {
  if (!finnhubKey) return;
  try {
    const history = getHistory();
    if (history.length === 0) return;

    const now = new Date();
    let hasChanges = false;
    const updatedHistory = [...history];

    for (let i = 0; i < updatedHistory.length; i++) {
      const item = updatedHistory[i];
      if (item.outcome === null && item.targetDate) {
        const targetDateObj = new Date(item.targetDate);
        if (!isNaN(targetDateObj.getTime()) && targetDateObj <= now) {
          try {
            const data = await fetchTickerData(item.ticker, finnhubKey);
            const currentPrice = data?.quote?.c;
            if (currentPrice != null && !isNaN(currentPrice) && item.priceAtScore > 0) {
              const returnPct = ((currentPrice - item.priceAtScore) / item.priceAtScore) * 100;
              let outcome = 'INCORRECT';

              if (item.signal === 'BUY_SIGNAL' && returnPct > 5) {
                outcome = 'CORRECT';
              } else if (item.signal === 'AVOID' && returnPct < -5) {
                outcome = 'CORRECT';
              } else if (item.signal === 'WATCH') {
                outcome = 'NEUTRAL';
              }

              updatedHistory[i] = {
                ...item,
                outcome: outcome,
                finalPrice: currentPrice,
                actualReturn: Number(returnPct.toFixed(2)),
              };
              hasChanges = true;
            }
          } catch (fetchErr) {
            console.warn(`Failed to resolve outcome for ${item.ticker}:`, fetchErr.message);
          }
        }
      }
    }

    if (hasChanges) {
      saveHistory(updatedHistory);
    }
  } catch (err) {
    console.warn('Failed to resolve outcomes:', err.message);
  }
}
