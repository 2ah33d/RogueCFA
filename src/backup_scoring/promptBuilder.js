import { getGuestTrackRecord } from './guestTracker';

/* ────────────────────────────────────────────
   Hold-period definitions
   ──────────────────────────────────────────── */

export const HOLD_PERIODS = {
  '1M': { label: '1 Month', category: 'short' },
  '3M': { label: '3 Months', category: 'short' },
  '6M': { label: '6 Months', category: 'mid' },
  '1Y': { label: '1 Year', category: 'long' },
  '3Y': { label: '3 Years', category: 'long' },
};

/* ────────────────────────────────────────────
   Time-horizon focus instructions
   ──────────────────────────────────────────── */
const TIME_FOCUS = {
  short: `HOLD PERIOD FOCUS (Short Term — 1 to 3 Months):
Focus your analysis on near-term catalysts, upcoming earnings dates, recent momentum, and news events within the next 90 days. Discount long-term structural factors. Flag any binary events (earnings, FDA decisions, macro releases) within the window.`,

  mid: `HOLD PERIOD FOCUS (Mid Term — 6 Months):
Balance near-term catalysts with business model durability. Give equal weight to current momentum and structural positioning. Flag risks in both the 0-90 day and 90-180 day windows.`,

  long: `HOLD PERIOD FOCUS (Long Term — 1 to 3 Years):
Ignore short-term price action and news noise. Focus on structural durability of the business model, management quality signals from the data, sector tailwinds, and whether the valuation supports a multi-year thesis.`,
};

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function sanitize(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .trim();
}

function formatMarketCap(cap) {
  if (!cap) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${Number(cap).toLocaleString()}`;
}

function formatNews(newsItems) {
  if (!newsItems || newsItems.length === 0) return 'No recent news available.';

  const lines = newsItems.slice(0, 15).map((item, i) => {
    const headline = sanitize(item.headline || '');
    const summary = sanitize(item.summary || '').slice(0, 150);
    const date = item.datetime
      ? new Date(item.datetime * 1000).toLocaleDateString('en-US')
      : '';
    return `${i + 1}. [${date}] ${headline}${summary ? ` — ${summary}` : ''}`;
  });

  return lines.join('\n').slice(0, 2000);
}

function formatConsensus(recommendation) {
  if (!recommendation || recommendation.length === 0) {
    return { text: 'No analyst consensus data available.', count: 0, details: null };
  }

  const latest = recommendation[0];
  const strongBuy = latest.strongBuy || 0;
  const buy = latest.buy || 0;
  const hold = latest.hold || 0;
  const sell = latest.sell || 0;
  const strongSell = latest.strongSell || 0;
  const total = strongBuy + buy + hold + sell + strongSell;

  return {
    text: `ANALYST CONSENSUS (most recent period — ${latest.period || 'N/A'}):
- Strong Buy: ${strongBuy}
- Buy: ${buy}
- Hold: ${hold}
- Sell: ${sell}
- Strong Sell: ${strongSell}
- Total Analysts: ${total}`,
    count: total,
    details: { strongBuy, buy, hold, sell, strongSell, total },
  };
}

function formatEarnings(earnings, currPrefix = '$') {
  if (!Array.isArray(earnings) || earnings.length === 0) {
    return 'No quarterly earnings data available.';
  }

  return earnings.map((q, i) => {
    const beat = q.reportedEPS != null && q.estimatedEPS != null
      ? (q.reportedEPS > q.estimatedEPS ? 'BEAT' : q.reportedEPS === q.estimatedEPS ? 'MET' : 'MISSED')
      : 'N/A';
    return `Q${i + 1} (${q.date}): Reported EPS ${currPrefix}${q.reportedEPS ?? 'N/A'} vs Est ${currPrefix}${q.estimatedEPS ?? 'N/A'} → ${beat} (${q.surprisePercentage != null ? q.surprisePercentage.toFixed(1) + '%' : 'N/A'} surprise)`;
  }).join('\n');
}

function formatBreakdown(breakdown) {
  return Object.entries(breakdown)
    .map(([key, value]) => `  - ${key}: ${value.toFixed(1)}`)
    .join('\n');
}

/* ────────────────────────────────────────────
   Signal Conflict Detection
   ──────────────────────────────────────────── */
function detectSignalConflicts(tickerData, alphaData, mathResult, positionInRange) {
  const conflicts = [];
  const breakdown = mathResult?.breakdown || {};
  const consensusScore = breakdown.consensus ?? 0;
  const earningsScore = breakdown.earnings ?? 0;
  const { recommendation, news } = tickerData || {};

  const rec = Array.isArray(recommendation) && recommendation.length > 0 ? recommendation[0] : null;
  const strongBuy = rec?.strongBuy || 0;
  const buy = rec?.buy || 0;
  const totalRec = strongBuy + buy + (rec?.hold || 0) + (rec?.sell || 0) + (rec?.strongSell || 0);

  /* Conflict 1: Strong earnings + weak analyst consensus */
  if (earningsScore >= 15 && consensusScore <= 15 && totalRec >= 3) {
    conflicts.push(
      `Strong earnings performance (Earnings score: ${earningsScore}/20) conflicts with weak or hesitant analyst consensus (Consensus score: ${consensusScore}).`
    );
  }

  /* Conflict 2: High buy consensus + stock near 52W low */
  const posNum = parseFloat(positionInRange);
  if (!isNaN(posNum) && posNum <= 25 && consensusScore >= 25 && totalRec >= 3) {
    conflicts.push(
      `High bullish analyst consensus (Consensus score: ${consensusScore}) conflicts with price action trading near the 52-week low (${posNum}% above low).`
    );
  }

  /* Conflict 3: Analyst upgrades + insider selling headlines */
  if (Array.isArray(news)) {
    const hasInsiderSell = news.some((item) =>
      /\binsider\s+(sell|sold|selling|dump)\b/i.test(`${item.headline || ''} ${item.summary || ''}`)
    );
    if (hasInsiderSell && (strongBuy + buy) > (totalRec * 0.5) && totalRec >= 3) {
      conflicts.push(
        `Bullish analyst positioning conflicts with recent news reports indicating executive or insider selling.`
      );
    }
  }

  return conflicts;
}

/* ────────────────────────────────────────────
   buildPrompt — v2 architecture
   Math score is pre-calculated. LLM explains it.
   ──────────────────────────────────────────── */

export function buildPrompt(tickerData, alphaData, mathResult, holdPeriod, ticker = '', guestName = null) {
  const { profile, quote, recommendation, news } = tickerData || {};
  const period = HOLD_PERIODS[holdPeriod] || HOLD_PERIODS['6M'];
  const overview = alphaData?.overview || null;
  const earnings = alphaData?.earnings || null;
  const safeTicker = String(ticker || profile?.ticker || quote?.symbol || '').trim().toUpperCase();

  /* Check BNN MarketCall Analyst Track Record & Optimal Horizon */
  const effectiveGuest = guestName || tickerData?.guest || null;
  const guestRecord = effectiveGuest ? getGuestTrackRecord(effectiveGuest) : null;
  const hasGuestRecord = guestRecord && guestRecord.resolvedPicks >= 3 && guestRecord.hitRate !== null;
  const guestInstruction = hasGuestRecord
    ? `\n\nBNN MARKETCALL ANALYST TRACK RECORD & TIMEFRAME SPECIALIST CONTEXT:\nThis stock is being evaluated in the context of BNN MarketCall analyst ${guestRecord.guestName} (${guestRecord.firm}).\n- Historical Accuracy: ${(guestRecord.hitRate * 100).toFixed(0)}% accuracy across ${guestRecord.correctPicks}/${guestRecord.resolvedPicks} resolved picks (Sample: Latest ${guestRecord.dataUsedPicks || 9} picks across ${guestRecord.dataUsedEpisodes || 3} episodes).\n- Average Return: +${guestRecord.avgReturn}% across resolved calls.\n- Time Horizon Specialist Assessment: ${guestRecord.guestName} performs best on the ${guestRecord.optimalHorizonLabel} timeframe (${(guestRecord.optimalHorizonHitRate * 100).toFixed(0)}% win rate, +${guestRecord.optimalHorizonReturn}% avg return).\n- If the investor's selected ${period.label} horizon aligns with or benefits from ${guestRecord.guestName}'s optimal holding timeframe (${guestRecord.optimalHorizonKey}), explicitly note this positive convergence in your timeframe_verdict or thesis.\n`
    : '';

  /* Canadian Market Identity Detection */
  const isTSX =
    safeTicker.endsWith('.TO') ||
    safeTicker.endsWith('.V') ||
    (profile?.exchange || '').toUpperCase().includes('TORONTO') ||
    (profile?.exchange || '').toUpperCase().includes('TSX') ||
    profile?.currency === 'CAD' ||
    profile?.country === 'CA';

  const currPrefix = isTSX ? 'CAD $' : '$';

  /* Price data */
  const current = quote?.c || 0;
  const high52w = quote?.h52 || overview?.fiftyTwoWeekHigh || null;
  const low52w = quote?.l52 || overview?.fiftyTwoWeekLow || null;
  const range = (high52w != null && low52w != null) ? high52w - low52w : 0;
  const positionInRange =
    (range > 0 && high52w != null && low52w != null) ? ((current - low52w) / range * 100).toFixed(1) : 'N/A';
  const changePercent =
    quote?.dp != null ? quote.dp.toFixed(2) : 'N/A';

  /* Consensus */
  const consensus = formatConsensus(recommendation);

  /* News */
  const newsText = formatNews(news);

  /* Detect signal conflicts */
  const conflicts = detectSignalConflicts(tickerData, alphaData, mathResult, positionInRange);
  const conflictInstruction = conflicts.length > 0
    ? `\nDETECTED SIGNAL CONFLICTS (YOU MUST ADDRESS THESE DIRECTLY IN YOUR THESIS OR RISKS):\n${conflicts.map((c, i) => `${i + 1}. ${c}`).join('\n')}\nExplain what caused this contradiction and resolve it for the investor.\n`
    : '';

  const tsxInstruction = isTSX
    ? `\n\nCANADIAN MARKET IDENTITY (TSX-FIRST RULE):
This asset is traded on a Canadian stock exchange (${profile?.exchange || 'TSX/TORONTO'}) or reports in Canadian Dollars (CAD).
- You MUST explicitly label all price targets, valuation ratios, and financial figures in Canadian Dollars (CAD) or use the CAD$ prefix.
- Frame comparative benchmarks and industry norms relative to the Canadian market and TSX sector peers where applicable.
- Note Canadian exchange liquidity or dual-listing context if relevant in your risk analysis.\n`
    : '';

  /* ── System prompt ── */
  const systemPrompt = `You are a CFA-level equity analyst. Your role is to EXPLAIN a pre-calculated investment score — not to generate one.

A deterministic math engine has already scored this stock at ${mathResult.score}/100 (Grade: ${mathResult.grade}, Signal: ${mathResult.signal}).

Score breakdown:
${formatBreakdown(mathResult.breakdown)}
${conflictInstruction}
Your job is to:
1. Explain WHY this score makes sense given the data below
2. Identify the STORY behind the numbers — what's driving the score up or down
3. Provide a concise investment thesis grounded ONLY in the provided data${conflicts.length > 0 ? ' (addressing any detected signal conflicts directly)' : ''}
4. Flag the single most important thing to watch during the ${period.label} hold period
5. List specific risks and catalysts from the data

${TIME_FOCUS[period.category]}${tsxInstruction}${guestInstruction}

STRICT RULES — VIOLATION OF ANY RULE INVALIDATES YOUR RESPONSE:
- Do NOT reference any data not explicitly listed in the AVAILABLE DATA section below
- If you don't have data for a field, write "Insufficient data"
- Do NOT describe the 52-week range as "narrow" or "wide" — state exact numbers only
- Do NOT mention news events unless news data is explicitly provided below
- Do NOT invent earnings dates, product launches, or events not in the data
- Do NOT override the pre-calculated score, grade, or signal
- Ground every claim in a specific number from the data
- CRITICAL JSON RULE: Do NOT use unescaped double quotes inside string values. If quoting text or ratings inside a field, use single quotes ('example') instead of double quotes. Do not use literal newlines inside string values.

Respond ONLY with valid JSON matching this exact schema. No preamble, no markdown fences, no explanation outside the JSON object.

{
  "thesis": "2-3 sentence investment thesis citing specific numbers from the data${conflicts.length > 0 ? ' and reconciling detected signal conflicts' : ''}",
  "sentiment_summary": "One sentence on recent news tone from PROVIDED headlines only, or 'Insufficient data' if no news provided",
  "timeframe_verdict": "One sentence specific to the ${period.label} hold period",
  "key_risks": ["risk grounded in data", "risk grounded in data"],
  "key_catalysts": ["catalyst grounded in data", "catalyst grounded in data"],
  "watch_for": "The single most important thing to monitor during this hold period"
}`;


  /* ── User prompt ── */
  const upperTicker = safeTicker;
  let userPrompt = `AVAILABLE DATA (use only this, infer nothing):

COMPANY PROFILE:
- Ticker: ${upperTicker}
- Company Name: ${profile?.name || 'Unknown'}
- Sector / Industry: ${profile?.finnhubIndustry || overview?.industry || 'Unknown'}
- Market Cap: ${formatMarketCap(
    profile?.marketCapitalization
      ? profile.marketCapitalization * 1e6
      : overview?.marketCap || null
  )}
- Exchange: ${profile?.exchange || 'Unknown'}
- Country: ${profile?.country || 'Unknown'}

CURRENT PRICE DATA:
- Current Price: ${currPrefix}${current.toFixed(2)}
- Daily Change: ${changePercent}%
- 52-Week High: ${high52w != null ? currPrefix + high52w.toFixed(2) : 'N/A'}
- 52-Week Low: ${low52w != null ? currPrefix + low52w.toFixed(2) : 'N/A'}
- Position in 52-Week Range: ${positionInRange !== 'N/A' ? positionInRange + '% from low' : 'N/A'}
- Previous Close: ${currPrefix}${(quote?.pc || 0).toFixed(2)}

${consensus.text}`;

  /* Alpha Vantage fundamentals (if available) */
  if (overview) {
    userPrompt += `

FUNDAMENTAL DATA (Alpha Vantage):
- P/E Ratio: ${overview.peRatio ?? 'N/A'}
- Forward P/E: ${overview.forwardPE ?? 'N/A'}
- PEG Ratio: ${overview.pegRatio ?? 'N/A'}
- EPS (TTM): ${currPrefix}${overview.eps ?? 'N/A'}
- Dividend Yield: ${overview.dividendYield != null ? (overview.dividendYield * 100).toFixed(2) + '%' : 'N/A'}
- Profit Margin: ${overview.profitMargin != null ? (overview.profitMargin * 100).toFixed(1) + '%' : 'N/A'}
- Revenue Growth (QoQ YoY): ${overview.revenueGrowthYoY != null ? (overview.revenueGrowthYoY * 100).toFixed(1) + '%' : 'N/A'}
- Earnings Growth (QoQ YoY): ${overview.earningsGrowthYoY != null ? (overview.earningsGrowthYoY * 100).toFixed(1) + '%' : 'N/A'}
- Analyst Target Price: ${currPrefix}${overview.analystTargetPrice ?? 'N/A'}${overview.analystTargetPrice && current > 0 ? ` (${(((overview.analystTargetPrice - current) / current) * 100).toFixed(1)}% implied upside)` : ''}
- Beta: ${overview.beta ?? 'N/A'}
- Return on Equity: ${overview.returnOnEquity != null ? (overview.returnOnEquity * 100).toFixed(1) + '%' : 'N/A'}
- Return on Assets: ${overview.returnOnAssets != null ? (overview.returnOnAssets * 100).toFixed(1) + '%' : 'N/A'}`;
  }

  if (earnings && earnings.length > 0) {
    userPrompt += `

QUARTERLY EARNINGS (last ${earnings.length} quarters):
${formatEarnings(earnings, currPrefix)}`;
  }

  userPrompt += `

RECENT NEWS (last 30 days):
${newsText}

PRE-CALCULATED SCORE: ${mathResult.score}/100 (${mathResult.grade}) — ${mathResult.signal}
Score Breakdown:
${formatBreakdown(mathResult.breakdown)}${conflicts.length > 0 ? `\n\nDETECTED SIGNAL CONFLICTS TO RESOLVE:\n${conflicts.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}
${
  consensus.count < 3
    ? '\nNOTE: Fewer than 3 analyst ratings available. Score reliability may be reduced.'
    : ''
}

Analyze this data for a ${period.label} investment horizon. Explain the score, provide a thesis, and flag risks.`;

  return {
    systemPrompt,
    userPrompt,
    limitedData: consensus.count < 3,
    companyName: profile?.name || overview?.name || upperTicker,
  };
}

/* ────────────────────────────────────────────
   buildComparisonPrompt — comparative head-to-head narrative
   ──────────────────────────────────────────── */
export function buildComparisonPrompt(scorecardsList, holdPeriod) {
  const period = HOLD_PERIODS[holdPeriod] || HOLD_PERIODS['6M'];

  const hasTSX = scorecardsList.some((card) =>
    card.ticker?.toUpperCase().endsWith('.TO') ||
    card.ticker?.toUpperCase().endsWith('.V') ||
    card.exchange?.toUpperCase().includes('TORONTO') ||
    card.exchange?.toUpperCase().includes('TSX') ||
    card.currency === 'CAD' ||
    card.country === 'CA'
  );

  const tsxRule = hasTSX
    ? `- For Canadian / TSX-listed stocks (e.g. ending in .TO or reporting in CAD), explicitly label all financial figures and price targets in CAD or with CAD$ prefix and frame against Canadian market liquidity.\n`
    : '';

  const systemPrompt = `You are a CFA-level head-to-head equity comparison analyst.
You will receive pre-calculated deterministic math scores and data summaries for multiple stocks over a shared ${period.label} investment horizon.

Your role is to compare relative risks, valuation trade-offs, and signal consistency across all provided stocks, and identify the top candidate for this hold period.

STRICT RULES:
- Do NOT invent metrics not present in the data.
- Ground all comparison statements in the provided deterministic sub-scores or fundamentals.
- Do NOT override deterministic scores.
- CRITICAL JSON RULE: Do NOT use unescaped double quotes inside string values. If quoting text inside a field, use single quotes ('example') instead of double quotes. Do not use literal newlines inside string values.
${tsxRule}
Respond ONLY with valid JSON matching this exact schema:
{
  "winner": "TICKER",
  "comparative_summary": "2-3 sentence summary comparing relative strengths across sub-scores for the ${period.label} horizon",
  "key_tradeoffs": [
    "Specific tradeoff citing numbers",
    "Specific tradeoff citing numbers"
  ]
}`;

  const userPrompt = `HEAD-TO-HEAD COMPARISON DATA (${period.label} Hold Period):

${scorecardsList
  .map((card) => {
    const isTSX =
      card.ticker?.toUpperCase().endsWith('.TO') ||
      card.ticker?.toUpperCase().endsWith('.V') ||
      card.exchange?.toUpperCase().includes('TORONTO') ||
      card.exchange?.toUpperCase().includes('TSX') ||
      card.currency === 'CAD' ||
      card.country === 'CA';
    return `[${card.ticker}] (${card.companyName || card.ticker})${isTSX ? ' [TSX / CAD Asset]' : ''}
- Total Math Score: ${card.score}/100 (Grade: ${card.grade}, Signal: ${card.signal})
- Breakdown: Consensus: ${card.score_breakdown?.consensus ?? 'N/A'}, Momentum: ${card.score_breakdown?.momentum ?? 'N/A'}, Valuation: ${card.score_breakdown?.valuation ?? 'N/A'}, Earnings: ${card.score_breakdown?.earnings ?? 'N/A'}
- Thesis: ${card.thesis || 'N/A'}`;
  })
  .join('\n\n')}

Compare these assets and determine which has the strongest quantitative and qualitative profile for a ${period.label} horizon.`;

  return { systemPrompt, userPrompt };
}
