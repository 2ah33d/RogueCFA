/* ────────────────────────────────────────────
   calculateScore — deterministic math-only scoring
   Produces a 0-100 score from hard data.
   No LLM involvement. Fully auditable.
   ──────────────────────────────────────────── */

/**
 * @param {Object} finnhubData - { profile, quote, recommendation, news }
 * @param {Object|null} alphaData - { overview, earnings } or null
 * @param {string} holdPeriod - '1M' | '3M' | '6M' | '1Y' | '3Y'
 * @returns {{ score, grade, signal, breakdown, hasAlphaVantage }}
 */
export function calculateScore(finnhubData, alphaData, holdPeriod) {
  const hasAV = Boolean(alphaData?.overview);

  const rawBreakdown = hasAV
    ? calculateFullScore(finnhubData, alphaData, holdPeriod)
    : calculateBasicScore(finnhubData, holdPeriod);

  const score = Math.round(
    Math.max(0, Math.min(100, Object.values(rawBreakdown.scores).reduce((a, b) => a + b, 0)))
  );

  const grade = scoreToGrade(score);
  const signal = scoreToSignal(score);

  return {
    score,
    grade,
    signal,
    breakdown: rawBreakdown.scores,
    coverageDepth: rawBreakdown.coverageDepth,
    coverageModifier: rawBreakdown.coverageModifier,
    hasAlphaVantage: hasAV,
  };
}

/* ────────────────────────────────────────────
   Full scoring (Finnhub + Alpha Vantage)
   Total: 100 points shifted dynamically by holdPeriod
   ──────────────────────────────────────────── */
function calculateFullScore(finnhubData, alphaData, holdPeriod) {
  const { recommendation, quote, news } = finnhubData;
  const { overview, earnings } = alphaData;

  /* Time-horizon dynamic weight allocation (must sum exactly to 100) */
  const weightsByPeriod = {
    '1M': { newsSentiment: 35, momentum: 30, consensus: 20, earnings: 10, valuation: 5 },
    '3M': { newsSentiment: 35, momentum: 30, consensus: 20, earnings: 10, valuation: 5 },
    '6M': { consensus: 25, momentum: 20, valuation: 20, earnings: 20, newsSentiment: 15 },
    '1Y': { earnings: 35, valuation: 30, consensus: 20, momentum: 10, newsSentiment: 5 },
    '3Y': { valuation: 45, earnings: 40, consensus: 15, momentum: 0, newsSentiment: 0 },
  };

  const weights = weightsByPeriod[holdPeriod] || weightsByPeriod['6M'];
  const consensusRes = calcConsensus(recommendation, weights.consensus || 0);

  const scores = {};
  if (weights.consensus > 0) scores.consensus = consensusRes.score;
  if (weights.momentum > 0) scores.momentum = calcMomentum(quote, weights.momentum, overview);
  if (weights.valuation > 0) scores.valuation = calcValuation(overview, quote, weights.valuation);
  if (weights.earnings > 0) scores.earnings = calcEarnings(earnings, overview, weights.earnings);
  if (weights.newsSentiment > 0) scores.newsSentiment = calcNewsSentiment(news, weights.newsSentiment);

  return {
    scores,
    coverageDepth: consensusRes.total,
    coverageModifier: consensusRes.modifier,
  };
}

/* ────────────────────────────────────────────
   Basic scoring (Finnhub only)
   Total: 100 points shifted dynamically by holdPeriod
   ──────────────────────────────────────────── */
function calculateBasicScore(finnhubData, holdPeriod) {
  const { recommendation, quote, news } = finnhubData;

  /* Time-horizon dynamic weight allocation (must sum exactly to 100) */
  const weightsByPeriod = {
    '1M': { newsSentiment: 45, momentum: 35, consensus: 20 },
    '3M': { newsSentiment: 45, momentum: 35, consensus: 20 },
    '6M': { consensus: 40, momentum: 30, newsSentiment: 30 },
    '1Y': { consensus: 60, momentum: 25, newsSentiment: 15 },
    '3Y': { consensus: 80, momentum: 15, newsSentiment: 5 },
  };

  const weights = weightsByPeriod[holdPeriod] || weightsByPeriod['6M'];
  const consensusRes = calcConsensus(recommendation, weights.consensus || 0);

  const scores = {};
  if (weights.consensus > 0) scores.consensus = consensusRes.score;
  if (weights.momentum > 0) scores.momentum = calcMomentum(quote, weights.momentum);
  if (weights.newsSentiment > 0) scores.newsSentiment = calcNewsSentiment(news, weights.newsSentiment);

  return {
    scores,
    coverageDepth: consensusRes.total,
    coverageModifier: consensusRes.modifier,
  };
}

/* ────────────────────────────────────────────
   Sub-score calculators
   ──────────────────────────────────────────── */

/**
 * Analyst Consensus sub-score with Coverage Depth Modifier.
 */
function calcConsensus(recommendation, maxPoints) {
  if (!Array.isArray(recommendation) || recommendation.length === 0) {
    return { score: maxPoints > 0 ? Math.round(maxPoints * 0.2 * 10) / 10 : 0, total: 0, modifier: 0.2 };
  }

  const rec = recommendation[0];
  const strongBuy = rec.strongBuy || 0;
  const buy = rec.buy || 0;
  const hold = rec.hold || 0;
  const sell = rec.sell || 0;
  const strongSell = rec.strongSell || 0;
  const total = strongBuy + buy + hold + sell + strongSell;

  if (total === 0) {
    return { score: maxPoints > 0 ? Math.round(maxPoints * 0.2 * 10) / 10 : 0, total: 0, modifier: 0.2 };
  }

  let modifier = 1.0;
  if (total <= 3) modifier = 0.2;
  else if (total <= 10) modifier = 0.6;
  else if (total <= 20) modifier = 0.8;

  if (maxPoints <= 0) {
    return { score: 0, total, modifier };
  }

  const weighted =
    (strongBuy * 1.0 + buy * 0.75 + hold * 0.5 + sell * 0.25 + strongSell * 0) /
    total;

  const finalScore = Math.round(weighted * maxPoints * modifier * 10) / 10;
  return { score: finalScore, total, modifier };
}

/**
 * Price Momentum sub-score.
 */
function calcMomentum(quote, maxPoints, overview = null) {
  if (maxPoints <= 0) return 0;
  if (!quote) return Math.round(maxPoints * 0.5 * 10) / 10;

  const current = quote.c || 0;
  const high = quote.h52 || overview?.fiftyTwoWeekHigh || null;
  const low = quote.l52 || overview?.fiftyTwoWeekLow || null;

  if (high == null || low == null || high <= low || current <= 0) {
    return Math.round(maxPoints * 0.5 * 10) / 10;
  }

  const range = high - low;
  const position = Math.max(0, Math.min(1, (current - low) / range));
  return Math.round(position * maxPoints * 10) / 10;
}

/**
 * Valuation sub-score (requires Alpha Vantage).
 */
function calcValuation(overview, quote, maxPoints) {
  if (!overview || maxPoints <= 0) return 0;

  let valRatio = 0;
  const current = quote?.c || 0;

  /* Target price upside (up to 0.6 of valuation score) */
  if (overview.analystTargetPrice && current > 0) {
    const upside = (overview.analystTargetPrice - current) / current;
    const upsideRatio = Math.min(0.6, Math.max(0, (upside / 0.3) * 0.6));
    valRatio += upsideRatio;
  } else {
    valRatio += 0.3;
  }

  /* P/E reasonableness (up to 0.4 of valuation score) */
  if (overview.peRatio && overview.peRatio > 0) {
    if (overview.peRatio <= 20) valRatio += 0.4;
    else if (overview.peRatio <= 30) valRatio += 0.28;
    else if (overview.peRatio <= 50) valRatio += 0.16;
    else valRatio += 0.08;
  } else {
    valRatio += 0.2;
  }

  return Math.round(valRatio * maxPoints * 10) / 10;
}

/**
 * Earnings Quality sub-score (requires Alpha Vantage).
 */
function calcEarnings(earnings, overview, maxPoints) {
  if (maxPoints <= 0) return 0;
  let earnRatio = 0;

  /* Earnings beat rate (up to 0.5 of earnings score) */
  if (Array.isArray(earnings) && earnings.length > 0) {
    const beats = earnings.filter(
      (q) => q.reportedEPS != null && q.estimatedEPS != null && q.reportedEPS > q.estimatedEPS
    ).length;
    const beatRate = beats / earnings.length;
    earnRatio += beatRate * 0.5;
  } else {
    earnRatio += 0.25;
  }

  /* EPS / earnings growth trend (up to 0.5 of earnings score) */
  if (overview?.earningsGrowthYoY != null) {
    const growth = overview.earningsGrowthYoY;
    if (growth > 0.2) earnRatio += 0.5;
    else if (growth > 0.1) earnRatio += 0.4;
    else if (growth > 0) earnRatio += 0.3;
    else if (growth > -0.1) earnRatio += 0.2;
    else earnRatio += 0.1;
  } else {
    earnRatio += 0.25;
  }

  return Math.round(earnRatio * maxPoints * 10) / 10;
}

/**
 * Basic news sentiment (Finnhub news analysis).
 */
function calcNewsSentiment(news, maxPoints) {
  if (maxPoints <= 0) return 0;
  if (!Array.isArray(news) || news.length === 0) {
    return Math.round(maxPoints * 0.5 * 10) / 10;
  }

  const positiveWords = /\b(surge|soar|beat|upgrade|bull|gain|record|growth|strong|profit|buy|outperform|raise|boost|accelerat|expand)\b/i;
  const negativeWords = /\b(crash|plunge|miss|downgrade|bear|loss|decline|weak|sell|underperform|cut|slash|drop|fall|warn|risk|concern)\b/i;

  let positive = 0;
  let negative = 0;

  for (const item of news.slice(0, 15)) {
    const text = `${item.headline || ''} ${item.summary || ''}`;
    if (positiveWords.test(text)) positive++;
    if (negativeWords.test(text)) negative++;
  }

  const total = positive + negative;
  if (total === 0) return Math.round(maxPoints * 0.5 * 10) / 10;

  const ratio = positive / total;
  return Math.round(ratio * maxPoints * 10) / 10;
}

/* ────────────────────────────────────────────
   Grade and Signal mappings
   ──────────────────────────────────────────── */

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function scoreToSignal(score) {
  if (score >= 70) return 'BUY_SIGNAL';
  if (score >= 45) return 'WATCH';
  return 'AVOID';
}
