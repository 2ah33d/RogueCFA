/* ════════════════════════════════════════════════════════════════
   goldenGoose.js — Golden Goose v2
   Layer 1: Deterministic shortlist builder ($0 cost, 0 threshold decisions)
   Layer 2: LLM Eyes prompt builder & response validator (Claude Sonnet 5)
   ════════════════════════════════════════════════════════════════ */

export const STANCE_WEIGHT = {
  buy: 1.0,
  hold: 0.3,
  sell: -1.0,
};

export const SOURCE_MULTIPLIER = {
  pick: 1.5,           // formal top pick — always bullish
  caller_mention: 1.0, // guest responding to caller Q&A — can be buy/hold/sell
};

export const BUY_HOLD_MIN_MENTIONS = 2;

/**
 * Standardize ticker symbol for comparison (e.g. SHOP -> SHOP, SHOP.TO -> SHOP.TO)
 */
export function normalizeTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') return '';
  return ticker.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Normalize stance string to standard categories ('buy', 'hold', 'sell')
 */
export function normalizeStance(stance) {
  if (!stance || typeof stance !== 'string') return 'buy';
  const s = stance.toLowerCase().trim();
  if (s.includes('sell') || s.includes('avoid') || s.includes('trim') || s.includes('bear')) {
    return 'sell';
  }
  if (s.includes('hold') || s.includes('neutral') || s.includes('wait')) {
    return 'hold';
  }
  return 'buy';
}

/**
 * Calculate deterministic weighted score for a single mention.
 */
export function weightedScore(mention) {
  const stanceWeight = STANCE_WEIGHT[mention.stance] ?? 0;
  const sourceMultiplier = SOURCE_MULTIPLIER[mention.mentionType] ?? 1.0;
  return stanceWeight * sourceMultiplier;
}

/**
 * Layer 1: Build deterministic shortlists for Buy/Hold candidates and Sell candidates.
 * No threshold decisions — only counts, weights, and shortlists.
 *
 * @param {Array<Object>} episodes - Array of episode objects
 * @param {number} windowDays - Rolling window size in days (default: 7)
 * @returns {{ buyHoldCandidates: Array, sellCandidates: Array }}
 */
export function buildShortlists(episodes = [], windowDays = 7) {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return { buyHoldCandidates: [], sellCandidates: [] };
  }

  const cutoff = Date.now() - windowDays * 86_400_000;
  const tickerAgg = {};

  for (const episode of episodes) {
    if (!episode) continue;
    const epDateStr = episode.episodeDate || episode.air_date || episode.date;
    if (epDateStr && new Date(epDateStr).getTime() < cutoff) continue;

    const guestName =
      episode.guest ||
      episode.digest?.guest ||
      episode.result?.digest?.guest ||
      episode.analyst_name ||
      'MarketCall Analyst';
    const digest = episode.digest || episode;

    const topPicks = Array.isArray(digest.picks)
      ? digest.picks
      : Array.isArray(digest.top_picks)
      ? digest.top_picks
      : [];

    const callerMentions = Array.isArray(digest.callerMentions)
      ? digest.callerMentions
      : Array.isArray(digest.caller_mentions)
      ? digest.caller_mentions
      : [];

    /* Exclude pastPicks / recap section entirely — only current picks & callerMentions */
    const allMentions = [
      ...topPicks.map((p) => ({ ...p, mentionType: 'pick' })),
      ...callerMentions.map((c) => ({ ...c, mentionType: 'caller_mention' })),
    ];

    for (const m of allMentions) {
      const ticker = normalizeTicker(m.ticker);
      if (!ticker) continue;

      const stance = normalizeStance(m.stance || m.rating || (m.mentionType === 'pick' ? 'buy' : 'buy'));
      const epDate = epDateStr || 'Recent';

      /* Dedup key incorporates mentionType:
         Same guest naming a ticker as a pick + answering a caller question = 2 mentions.
         Same guest answering 2 callers on same ticker in same episode = 1 mention. */
      const epKey = `${epDate}_${guestName}_${ticker}_${m.mentionType}`;

      if (!tickerAgg[ticker]) {
        tickerAgg[ticker] = {
          ticker,
          company: m.company || m.companyName || m.company_name || ticker,
          seenEpKeys: new Set(),
          mentions: [],
        };
      }

      const agg = tickerAgg[ticker];
      agg.mentions.push({
        guest: guestName,
        date: epDate,
        stance,
        mentionType: m.mentionType,
        reasoning: m.reasoning || m.summary || m.thesis || m.commentary || 'Mentioned during broadcast.',
        epKey,
      });
      agg.seenEpKeys.add(epKey);
    }
  }

  const buyHoldCandidates = [];
  const sellCandidates = [];

  for (const agg of Object.values(tickerAgg)) {
    /* One mention per unique epKey — dedup happens here */
    const deduped = [...agg.seenEpKeys]
      .map((key) => agg.mentions.find((m) => m.epKey === key))
      .filter(Boolean);

    const buyHoldCount = deduped.filter((m) => m && (m.stance === 'buy' || m.stance === 'hold')).length;
    const sellCount = deduped.filter((m) => m.stance === 'sell').length;
    const weightedTotal = deduped.reduce((sum, m) => sum + weightedScore(m), 0);

    const candidate = {
      ticker: agg.ticker,
      company: agg.company,
      mentionCount: deduped.length,
      distinctGuestCount: new Set(deduped.map((m) => m.guest)).size,
      weightedScore: Math.round(weightedTotal * 10) / 10,
      mentions: deduped,
    };

    if (buyHoldCount >= BUY_HOLD_MIN_MENTIONS) {
      buyHoldCandidates.push(candidate);
    }

    if (sellCount >= 1) {
      sellCandidates.push(candidate);
    }
  }

  buyHoldCandidates.sort((a, b) => b.weightedScore - a.weightedScore);
  sellCandidates.sort((a, b) => a.weightedScore - b.weightedScore);

  return { buyHoldCandidates, sellCandidates };
}

/**
 * Layer 2: Construct the LLM Eyes prompt.
 */
export function buildLLMEyesPrompt({ buyHoldCandidates, sellCandidates }, windowDays = 7) {
  const allowedTickers = [
    ...buyHoldCandidates.map((c) => c.ticker),
    ...sellCandidates.map((c) => c.ticker),
  ];

  const formatCandidate = (c) => `
Ticker: ${c.ticker} (${c.company})
Weighted Score: ${c.weightedScore} | ${c.mentionCount} mention(s) across ${c.distinctGuestCount} distinct analyst(s)
Analyst Reasoning:
${c.mentions.map((m) => `  - [${m.mentionType.toUpperCase()}, ${m.stance.toUpperCase()}] ${m.guest} (${m.date}): "${m.reasoning}"`).join('\n')}`;

  const prompt = `You are an elite CFA analyst evaluating stock tickers for RogueCFA's "Golden Goose" multi-analyst radar, synthesizing recent BNN Bloomberg MarketCall broadcasts from the past ${windowDays} days.

You may ONLY evaluate and output tickers from this exact candidate list: ${allowedTickers.join(', ')}.

=== BUY/HOLD CANDIDATES (Multi-analyst convergence) ===
${buyHoldCandidates.map(formatCandidate).join('\n---\n') || '(none this window)'}

=== SELL CANDIDATES (All analyst sell/trim mentions) ===
${sellCandidates.map(formatCandidate).join('\n---\n') || '(none this window)'}

Your evaluation criteria:
1. Golden Picks: Identify the strongest candidate tickers showing genuine fundamental, valuation, or structural tailwinds (e.g. accelerating growth, strong capital allocation, expanding margins, or secular industry momentum). If a candidate has multiple bullish mentions or high conviction from reputable analysts, select it.
2. Warning Sells: Highlight companies facing real structural headwinds, balance sheet concerns, debt issues, or broken technical trends cited by the analysts.
3. For each selected ticker, write a concise 1-2 sentence conviction rationale summarizing why it was selected based on the analyst quotes provided.

Respond strictly in valid JSON format with NO surrounding markdown or extra text:
{
  "goldenPicks": [
    { "ticker": "...", "rationale": "1-2 sentence concise conviction thesis referencing the analysts' points above" }
  ],
  "warningSells": [
    { "ticker": "...", "rationale": "1-2 sentence warning summary referencing the analysts' points above" }
  ]
}`;

  return { prompt, allowedTickers };
}

/**
 * Validate LLM Eyes JSON response against allowedTickers list with flexible key matching.
 */
export function validateLLMEyesResponse(llmJson, allowedTickers) {
  const normalizedAllowed = allowedTickers.map((t) => normalizeTicker(t));
  const allowedSet = new Set(normalizedAllowed);

  const rawPicks = llmJson?.goldenPicks || llmJson?.golden_picks || llmJson?.picks || [];
  const rawSells = llmJson?.warningSells || llmJson?.warning_sells || llmJson?.warnings || [];

  const filterAndFormat = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (!item || !item.ticker) return null;
        const norm = normalizeTicker(item.ticker);
        const matched = allowedTickers.find(
          (orig) =>
            normalizeTicker(orig) === norm ||
            normalizeTicker(orig) === norm.replace(/\.(TO|UN|V|NE)$/, '') ||
            norm === normalizeTicker(orig).replace(/\.(TO|UN|V|NE)$/, '')
        );
        if (!matched) return null;
        return {
          ticker: matched,
          rationale: item.rationale || item.reasoning || item.thesis || 'Multi-analyst conviction pick surfaced from broadcast.',
        };
      })
      .filter(Boolean);
  };

  const goldenPicks = filterAndFormat(rawPicks);
  const warningSells = filterAndFormat(rawSells);

  const allItems = [
    ...(Array.isArray(rawPicks) ? rawPicks : []),
    ...(Array.isArray(rawSells) ? rawSells : []),
  ];
  const rejectedTickers = allItems
    .map((i) => i?.ticker)
    .filter((t) => t && !allowedSet.has(normalizeTicker(t)));

  return {
    goldenPicks,
    warningSells,
    _rejectedTickers: rejectedTickers,
  };
}

/**
 * Legacy compatibility fallback calculation (deterministic threshold mode).
 */
export function calculateGoldenGoose(episodes = [], windowDays = 7) {
  const { buyHoldCandidates, sellCandidates } = buildShortlists(episodes, windowDays);
  return {
    goldenPicks: buyHoldCandidates.map((c) => ({
      ticker: c.ticker,
      companyName: c.company,
      score: c.weightedScore,
      totalEpisodes: c.mentionCount,
      participatingAnalysts: Array.from(new Set(c.mentions.map((m) => m.guest))),
      allReasonings: c.mentions,
      topPickReasonings: c.mentions.filter((m) => m.mentionType === 'pick'),
      callerReasonings: c.mentions.filter((m) => m.mentionType === 'caller_mention'),
      isGoldenPick: true,
      isWarningSell: false,
    })),
    warningSells: sellCandidates.map((c) => ({
      ticker: c.ticker,
      companyName: c.company,
      score: c.weightedScore,
      totalEpisodes: c.mentionCount,
      participatingAnalysts: Array.from(new Set(c.mentions.map((m) => m.guest))),
      allReasonings: c.mentions,
      isGoldenPick: false,
      isWarningSell: true,
    })),
    allScores: [...buyHoldCandidates, ...sellCandidates],
    episodeCount: episodes.length,
    windowDays,
  };
}
