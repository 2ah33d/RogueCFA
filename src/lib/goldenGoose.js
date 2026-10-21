/* ════════════════════════════════════════════════════════════════
   goldenGoose.js — Golden Goose v2
   Layer 1: Deterministic shortlist builder ($0 cost, 0 threshold decisions)
   Layer 2: LLM Eyes prompt builder & response validator (Claude Sonnet 5)
   ════════════════════════════════════════════════════════════════ */

export const STANCE_WEIGHT = {
  buy: 1.0,
  hold: 0.2,
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
 * Detect stated or implied investment time horizon from reasoning text.
 * Distinguishes long-term compounders / secular growth from short-term rules-based / tactical trades.
 *
 * @param {string} text - Analyst commentary/reasoning
 * @returns {{ type: 'long_term' | 'short_term', label: string } | null}
 */
export function detectHorizon(text = '') {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // Explicit Short-term / Tactical / Rules-based / Swing trade
  if (
    /\b(strictly a trade|short-?term trade|rules-?based trade|here for a good time,? not a long time|swing trade|tactical trade|near-?term trade|take advantage of a bounce|trade this up to|quick trade|trade without a long-?term thesis)\b/i.test(lower)
  ) {
    return { type: 'short_term', label: 'Tactical Trade' };
  }

  // Explicit Long-term Growth / Compounder / Multi-year Investment
  if (
    /\b(long-?term growth|long-?term investment|long-?term holding|long-?term compounder|long-?term thesis|core holding|multi-?year (?:story|horizon|run|trend|growth|holding)|buy and hold|secular (?:growth|trend)|5 to 10 years|for the long haul|decade-long|generational|patient investor|patient capital)\b/i.test(lower)
  ) {
    return { type: 'long_term', label: 'Long-Term Growth' };
  }

  // General Long-Term statements (excluding negative contexts)
  if (
    /\b(long-?term|compounder|multi-?year)\b/i.test(lower) &&
    !/\b(not\s+(?:a\s+)?long-?term|no\s+long-?term|without\s+a\s+long-?term|not a long time)\b/i.test(lower)
  ) {
    return { type: 'long_term', label: 'Long-Term' };
  }

  return null;
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

  const cutoff = new Date(Date.now() - (windowDays + 1) * 86_400_000).setHours(0, 0, 0, 0);
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
      const reasoning = m.reasoning || m.summary || m.thesis || m.commentary || 'Mentioned during broadcast.';
      const horizon = detectHorizon(reasoning);

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
        reasoning,
        horizon,
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

    // Sort mentions newest date first
    deduped.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const latestMentionDate = deduped[0]?.date || 'Recent';

    const buyCount = deduped.filter((m) => m && m.stance === 'buy').length;
    const holdCount = deduped.filter((m) => m && m.stance === 'hold').length;
    const sellCount = deduped.filter((m) => m && m.stance === 'sell').length;
    const pickCount = deduped.filter((m) => m && m.mentionType === 'pick').length;
    const distinctBuyGuests = new Set(deduped.filter((m) => m && m.stance === 'buy').map((m) => m.guest)).size;
    const distinctGuests = new Set(deduped.map((m) => m.guest)).size;
    const weightedTotal = deduped.reduce((sum, m) => sum + weightedScore(m), 0);

    // Detect defensive yield / covered-call overlays or staged limit accumulator trades
    const isDefensiveOverlay = deduped.some((m) =>
      /\b(covered\s+calls?|sell\s+(?:short-dated\s+)?calls?|manufacture\s+yield|capped\s+upside|staged\s+limit|downside\s+buffer)\b/i.test(m.reasoning)
    );

    // Aggregate overall horizon for candidate: prefer explicit long-term or tactical
    const longTermCount = deduped.filter((m) => m.horizon?.type === 'long_term').length;
    const shortTermCount = deduped.filter((m) => m.horizon?.type === 'short_term').length;
    let candidateHorizon = null;
    if (longTermCount > 0) {
      candidateHorizon = { type: 'long_term', label: 'Long-Term Growth' };
    } else if (shortTermCount > 0) {
      candidateHorizon = { type: 'short_term', label: 'Tactical Trade' };
    }

    const candidate = {
      ticker: agg.ticker,
      company: agg.company,
      mentionCount: deduped.length,
      distinctGuestCount: distinctGuests,
      distinctBuyGuests,
      buyCount,
      holdCount,
      sellCount,
      pickCount,
      isDefensiveOverlay,
      horizon: candidateHorizon,
      latestMentionDate,
      weightedScore: Math.round(weightedTotal * 10) / 10,
      mentions: deduped,
    };

    /* Golden Goose Buy Candidates:
       1. MUST have at least 1 BUY recommendation (zero buys = strictly disqualified).
       2. MUST NOT have active SELL recommendations (sellCount === 0). Dissenting/bearish calls disqualify bullish consensus.
       3. STRICT MULTI-ANALYST REQUIREMENT:
          - MUST demonstrate genuine multi-analyst buy convergence across at least 2 distinct analysts (distinctGuests >= 2).
          - Multiple distinct analysts recommend BUY (distinctBuyGuests >= 2)
          - OR Official Top Pick with confirming analyst coverage (pickCount >= 1 && distinctGuests >= 2 && distinctBuyGuests >= 1).
          - A single analyst repeating remarks across broadcasts (distinctGuests === 1) is a single-analyst reiteration,
            NEVER multi-analyst convergence. Single-analyst repetition must NOT inflate conviction.
    */
    const isBullishConvergence =
      buyCount >= 1 &&
      sellCount === 0 &&
      distinctGuests >= 2 &&
      (distinctBuyGuests >= 2 || (pickCount >= 1 && distinctGuests >= 2));

    if (isBullishConvergence) {
      buyHoldCandidates.push(candidate);
    }

    /* Warning Sell Candidates:
       Any stock with at least 1 sell / trim / avoid recommendation.
    */
    if (sellCount >= 1) {
      sellCandidates.push(candidate);
    }
  }

  // Sort: Primary by score, Secondary tie-breaker by latest mention date available (newest to oldest)
  buyHoldCandidates.sort((a, b) => {
    if (b.weightedScore !== a.weightedScore) {
      return b.weightedScore - a.weightedScore;
    }
    const dateA = a.latestMentionDate || '';
    const dateB = b.latestMentionDate || '';
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    return b.mentionCount - a.mentionCount;
  });

  sellCandidates.sort((a, b) => {
    if (a.weightedScore !== b.weightedScore) {
      return a.weightedScore - b.weightedScore;
    }
    const dateA = a.latestMentionDate || '';
    const dateB = b.latestMentionDate || '';
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    return b.mentionCount - a.mentionCount;
  });

  return { buyHoldCandidates, sellCandidates, buyCandidates: buyHoldCandidates };
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
Weighted Score: ${c.weightedScore} | ${c.mentionCount} mention(s) across ${c.distinctGuestCount} distinct analyst(s) (${c.buyCount || 0} Buy, ${c.holdCount || 0} Hold, ${c.sellCount || 0} Sell)${c.isDefensiveOverlay ? ' [DEFENSIVE OVERLAY DETECTED]' : ''}
Analyst Reasoning:
${c.mentions.map((m) => `  - [${m.mentionType.toUpperCase()}, ${m.stance.toUpperCase()}] ${m.guest} (${m.date}): "${m.reasoning}"`).join('\n')}`;

  const prompt = `You are an elite financial analyst evaluating stock tickers for the "Golden Goose" multi-analyst radar, synthesizing recent BNN Bloomberg MarketCall broadcasts from the past ${windowDays} days.

You may ONLY evaluate and output tickers from this exact candidate list: ${allowedTickers.join(', ')}.

=== BUY CONVERGENCE CANDIDATES (Multi-analyst bullish consensus) ===
${buyHoldCandidates.map(formatCandidate).join('\n---\n') || '(none this window)'}

=== SELL CANDIDATES (All analyst sell/trim mentions) ===
${sellCandidates.map(formatCandidate).join('\n---\n') || '(none this window)'}

Your evaluation criteria:
1. Golden Picks: Select top 3 to 4 candidate tickers showing the strongest fundamental, valuation, or structural tailwinds.
   CRITICAL REQUIREMENT: Every Golden Pick MUST have genuine BUY conviction. NEVER select a stock with 0 buy ratings or conflicting sell ratings.
2. Warning Sells: Highlight companies facing real structural headwinds, balance sheet concerns, debt issues, or broken technical trends cited by the analysts.
3. For each selected ticker, write a concise 1-2 sentence conviction rationale summarizing why it was selected based on the analyst quotes provided.
4. Risk-Reward & Execution Asymmetry:
   - Carefully evaluate the price delta against any stated analyst price target and execution structure.
   - REJECT any candidate where the analyst cites high valuation with minimal expected upside to target (<5%) or recommends defensive hedging overlays (e.g. staged limit buy orders down 10-15% as buffers, or selling short-dated covered calls to manufacture yield).
   - Golden Picks MUST be genuine, unhedged directional long opportunities with attractive risk-reward. Do NOT surface defensive, capped-upside yield trades as high-conviction directional longs.

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
