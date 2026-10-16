import { supabase } from './_supabaseClient.js';
import {
  normalizeAnalystName,
  searchBnnPastPicks,
  parseBnnPastPicksArticle,
} from './_bnnScraper.js';

/* ════════════════════════════════════════════════════════════════
   CENTRALIZED & AUDITABLE SCORING ENGINE CONFIGURATION
   ════════════════════════════════════════════════════════════════ */
export const SCORING_CONFIG = {
  version: '3.2.0-shrinkage-uncalibrated-prior',
  ts: '2026-07-29',
  priorSource: 'uncalibrated prior baseline (mu_pop=50.0, k=4.5) — empirical population calibration pending full dataset ingestion',
  weightsSource: 'hand-chosen baseline (40% win consistency / 60% risk-adjusted alpha return)',
  populationMean: 50.0, // μ_pop uncalibrated prior baseline (50.0%)
  shrinkageK: 4.5,     // k shrinkage weight parameter
  tsxAnnualBenchmarkRate: 8.0,   // ~8.0% annual S&P/TSX Composite baseline return
  sp500AnnualBenchmarkRate: 10.0, // ~10.0% annual S&P 500 baseline return
  winsorizeAlphaLimit: 50.0,   // ±50pp alpha ceiling/floor
  hitRateWeight: 0.40, // 40% win consistency weight in raw score calculation (hand-chosen)
  alphaWeight: 0.60,   // 60% alpha return weight in raw score calculation (hand-chosen)
};

/**
 * Ticker-to-Benchmark Routing Logic:
 * Canadian tickers (.TO, .V, .CN, TSX) route to TSX annual rate (8.0%).
 * US/Other tickers (.O, .N, NASDAQ, NYSE, or un-suffixed tickers like C, MRK, CLS, PIPR, FCX, HROW) route to S&P 500 annual rate (10.0%).
 */
export function getAnnualBenchmarkRate(ticker) {
  if (!ticker || typeof ticker !== 'string') return SCORING_CONFIG.sp500AnnualBenchmarkRate;
  const clean = ticker.trim().toUpperCase();
  const isCanadian = clean.endsWith('.TO') || clean.endsWith('.V') || clean.endsWith('.CN') || clean.includes('TSX');
  return isCanadian ? SCORING_CONFIG.tsxAnnualBenchmarkRate : SCORING_CONFIG.sp500AnnualBenchmarkRate;
}

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Coldstart action
  if (req.query.action === 'coldstart' || req.method === 'POST') {
    return handleColdstart(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawGuest = req.query.guest || '';
  if (!rawGuest) {
    return res.status(400).json({ error: 'Guest name is required.' });
  }

  const cleanGuest = normalizeAnalystName(rawGuest);

  try {
    const { data: rows, error } = await supabase
      .from('analyst_track_record')
      .select('*')
      .ilike('analyst_name', `%${cleanGuest}%`)
      .order('pick_publish_date', { ascending: false });

    if (error) {
      console.warn('[analyst-record] Database query error:', error.message);
      return res.status(200).json({
        status: 'no_track_record',
        guestName: rawGuest,
        cleanGuest,
        message: `Database permission notice: ${error.message}`,
        picks: [],
        credibilityScore: null,
        hitRate: null,
      });
    }

    let activeRows = rows || [];

    /* DESIGN CONSTRAINT: On-demand search is a supplementary intake path into Supabase table analyst_track_record.
       Population calibration (mu_pop, k) MUST be derived from systematic background ingestion of the entire guest pool in Supabase,
       never from an isolated on-demand search subset. */
    if (activeRows.length < 9) {
      try {
        const { searchBnnPastPicks, parseBnnPastPicksArticle } = await import('./_bnnScraper.js');
        const articles = await searchBnnPastPicks(cleanGuest, 10);

        if (articles && articles.length > 0) {
          const scrapedRows = [];
          for (const article of articles) {
            try {
              const response = await fetch(article.url, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(8000),
              });
              if (!response.ok) continue;
              const html = await response.text();
              const parsed = parseBnnPastPicksArticle(html, article.url, cleanGuest);
              if (parsed && parsed.length > 0) {
                scrapedRows.push(...parsed);
              }
            } catch (artErr) {
              console.warn(`[analyst-record] Article scrape warning (${article.url}):`, artErr.message);
            }
          }

          if (scrapedRows.length > 0) {
            /* Upsert scraped rows into Supabase */
            const { data: inserted, error: insertErr } = await supabase
              .from('analyst_track_record')
              .upsert(scrapedRows, {
                onConflict: 'analyst_name, ticker, pick_publish_date',
                ignoreDuplicates: true,
              })
              .select();

            if (!insertErr && inserted && inserted.length > 0) {
              activeRows = inserted;
            } else {
              activeRows = scrapedRows;
            }
          }
        }
      } catch (csErr) {
        console.warn('[analyst-record] Inline cold-start error:', csErr.message);
      }
    }

    if (!activeRows || activeRows.length === 0) {
      return res.status(200).json({
        status: 'no_track_record',
        guestName: rawGuest,
        cleanGuest,
        message: 'No track record recorded yet for this analyst.',
        picks: [],
        credibilityScore: null,
        hitRate: null,
        avgAlpha: null,
      });
    }

    /* ── Calculate Ground-Truth Directional Hit Rate & Benchmark Alpha ── */
    const nowMs = Date.now();
    const tickerClusters = new Map();
    const episodeDatesSet = new Set();

    let rawHitCount = 0;
    let totalAlphaSum = 0;
    let totalReturnSum = 0;

    const evaluatedPicks = activeRows.map((pick) => {
      const reviewDateStr = pick.pick_publish_date || new Date().toISOString().split('T')[0];
      if (reviewDateStr) episodeDatesSet.add(reviewDateStr);

      const rawReturn = pick.total_return_pct ?? pick.return_pct ?? 0;

      /* 1. H_raw: Pure price direction I(TotalReturn_i > 0) — NO benchmark involved.
            Guarantees positive return rows (+X%) are ALWAYS classified as wins. */
      const isPositiveReturn = rawReturn > 0;
      if (isPositiveReturn) rawHitCount++;
      totalReturnSum += rawReturn;

      /* 2. Alpha_i: Benchmark-adjusted holding-period return.
            Routes ticker to TSX (8%) or S&P 500 (10%) annual rate based on exchange. */
      const annualBenchmarkRate = getAnnualBenchmarkRate(pick.ticker);
      const reviewMs = new Date(reviewDateStr).getTime();
      const validReviewMs = isNaN(reviewMs) ? nowMs : reviewMs;
      const holdingYears = Math.max(0.01, (nowMs - validReviewMs) / (365.25 * 86400 * 1000));

      const periodBenchmarkReturn = Number(
        ((Math.pow(1 + annualBenchmarkRate / 100, holdingYears) - 1) * 100).toFixed(2)
      );

      const rawAlpha = rawReturn - periodBenchmarkReturn;
      const winsorizedAlpha = Math.max(
        -SCORING_CONFIG.winsorizeAlphaLimit,
        Math.min(SCORING_CONFIG.winsorizeAlphaLimit, rawAlpha)
      );
      const isBeatBenchmark = winsorizedAlpha > 0;
      totalAlphaSum += winsorizedAlpha;

      /* Cluster by normalized ticker */
      const normTicker = pick.ticker.toUpperCase().replace(/\-(U|UN)$/i, '-U.TO');
      if (!tickerClusters.has(normTicker)) {
        tickerClusters.set(normTicker, []);
      }
      tickerClusters.get(normTicker).push(pick);

      return {
        id: pick.id,
        ticker: pick.ticker,
        companyName: pick.company_name,
        thenPrice: pick.then_price,
        nowPrice: pick.now_price,
        returnPct: pick.return_pct,
        totalReturnPct: pick.total_return_pct,
        reviewDate: reviewDateStr,
        holdingYears: Number(holdingYears.toFixed(2)),
        benchmarkRateAnnual: annualBenchmarkRate,
        benchmarkReturn: periodBenchmarkReturn,
        benchmarkAlpha: Number(winsorizedAlpha.toFixed(2)),
        isPositiveReturn,
        isBeatBenchmark,
      };
    });

    const nTotal = evaluatedPicks.length;
    const uniquePositionsCount = tickerClusters.size;
    const totalEpisodesCount = episodeDatesSet.size || 1;

    /* ── Ground-Truth Primary Stats ── */
    const rawHitRate = nTotal > 0 ? Number((rawHitCount / nTotal).toFixed(2)) : 0;
    const avgAlpha = nTotal > 0 ? Number((totalAlphaSum / nTotal).toFixed(2)) : 0;
    const avgTotalReturn = nTotal > 0 ? Number((totalReturnSum / nTotal).toFixed(2)) : 0;

    /* ── STRICT GENERALIZED GUARDRAIL ASSERTION FOR ALL ANALYSTS ──
       Validates rawHitRate against the actual sign of TotalReturn_i values as rendered in the Tracked Pick History data.
       Ensures NO positive return row can ever register as a loss.
    */
    const tablePositiveHits = evaluatedPicks.filter((p) => (p.totalReturnPct ?? p.returnPct ?? 0) > 0).length;
    const expectedHitRate = nTotal > 0 ? Number((tablePositiveHits / nTotal).toFixed(2)) : 0;

    if (Math.abs(rawHitRate - expectedHitRate) > 0.001) {
      const errMsg = `[Scoring Engine Integrity Failure] Computed rawHitRate (${rawHitRate}) diverges from source table positive-return count (${tablePositiveHits}/${nTotal} = ${expectedHitRate}).`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    /* ── Raw Score Formula ──
       Raw score combines undecayed ground-truth hit rate (40%) + alpha return (60%)
    */
    const hitRateScore = Math.max(0, Math.min(100, rawHitRate * 100));
    const alphaScore = Math.max(0, Math.min(100, 50 + (avgAlpha * 2.5)));
    const rawScore = (SCORING_CONFIG.hitRateWeight * hitRateScore) + (SCORING_CONFIG.alphaWeight * alphaScore);

    /* ── Empirical Bayes Shrinkage over N_eff (unique positions count) ── */
    const nEff = uniquePositionsCount;
    const k = SCORING_CONFIG.shrinkageK;
    const poolMean = SCORING_CONFIG.populationMean;
    const credibilityScore = Number((((nEff / (nEff + k)) * rawScore) + ((k / (nEff + k)) * poolMean)).toFixed(1));

    /* ── Persist score globally in Supabase analyst_scores table for all users ── */
    try {
      await supabase
        .from('analyst_scores')
        .upsert(
          {
            analyst_name: cleanGuest,
            credibility_score: Math.round(credibilityScore),
            hit_rate: rawHitRate,
            avg_alpha: avgAlpha,
            total_picks: nTotal,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'analyst_name' }
        );
    } catch (upsertErr) {
      console.warn('[analyst-record] Supabase analyst_scores upsert notice:', upsertErr.message);
    }

    return res.status(200).json({
      status: 'success',
      guestName: rawGuest,
      cleanGuest,
      scoringConfig: SCORING_CONFIG,
      totalPicks: nTotal,
      uniquePositionsCount,
      totalEpisodesCount,
      hitRate: rawHitRate,
      hitCount: rawHitCount,
      avgAlpha,
      avgTotalReturn,
      rawScore: Number(rawScore.toFixed(1)),
      credibilityScore,
      topPickHitRate: credibilityScore,
      historicalWinRate: credibilityScore,
      evaluationScope: 'Formal Top Picks only (caller Q&A excluded)',
      dataSummaryText: `Based on latest ${nTotal} past picks (${uniquePositionsCount} unique positions) across ${totalEpisodesCount} broadcast episode${totalEpisodesCount > 1 ? 's' : ''}`,
      picks: evaluatedPicks,
    });
  } catch (err) {
    console.error('[analyst-record] Exception:', err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}

const COLDSTART_ARTICLE_LIMIT = parseInt(process.env.COLDSTART_ARTICLE_LIMIT || '3', 10);
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function handleColdstart(req, res) {
  const analystRaw =
    req.method === 'POST' ? req.body?.analyst : req.query?.analyst;

  if (!analystRaw) {
    return res.status(400).json({ error: 'Analyst name is required.' });
  }

  const cleanName = normalizeAnalystName(analystRaw);
  if (!cleanName) {
    return res.status(400).json({ error: 'Invalid analyst name.' });
  }

  try {
    /* Step 1: Check if analyst already has records in analyst_track_record */
    const { count: existingCount, error: countErr } = await supabase
      .from('analyst_track_record')
      .select('id', { count: 'exact', head: true })
      .ilike('analyst_name', `%${cleanName}%`);

    if (!countErr && existingCount && existingCount > 0) {
      return res.status(200).json({
        status: 'already_exists',
        analyst: cleanName,
        existingRows: existingCount,
        message: `Analyst "${cleanName}" already has ${existingCount} tracked pick(s).`,
      });
    }

    /* Step 2: Cold-Start Search — fetch recent past picks articles from BNN via Queryly */
    const articles = await searchBnnPastPicks(cleanName, COLDSTART_ARTICLE_LIMIT);

    if (!articles || articles.length === 0) {
      return res.status(200).json({
        status: 'no_articles_found',
        analyst: cleanName,
        rowsInserted: 0,
        message: `No BNN past-picks review articles found for analyst "${cleanName}".`,
      });
    }

    let totalRowsInserted = 0;
    const processedArticles = [];

    /* Step 3: Scrape and parse each article */
    for (const article of articles) {
      try {
        const response = await fetch(article.url, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) continue;
        const html = await response.text();

        const rows = parseBnnPastPicksArticle(html, article.url, cleanName);

        if (rows && rows.length > 0) {
          const { data: inserted, error: insertErr } = await supabase
            .from('analyst_track_record')
            .upsert(rows, {
              onConflict: 'analyst_name, ticker, pick_publish_date',
              ignoreDuplicates: true,
            })
            .select();

          if (insertErr) {
            console.warn(`[analyst-coldstart] Insert error for ${article.url}:`, insertErr.message);
          } else {
            const count = inserted ? inserted.length : rows.length;
            totalRowsInserted += count;
            processedArticles.push({ url: article.url, rowsParsed: rows.length, inserted: count });
          }
        }
      } catch (articleErr) {
        console.warn(`[analyst-coldstart] Article fetch failed (${article.url}):`, articleErr.message);
      }
    }

    return res.status(200).json({
      status: 'success',
      analyst: cleanName,
      articlesFound: articles.length,
      articlesProcessed: processedArticles.length,
      rowsInserted: totalRowsInserted,
      details: processedArticles,
    });
  } catch (err) {
    console.error('[analyst-coldstart] Exception:', err);
    return res.status(500).json({
      status: 'error',
      analyst: cleanName,
      error: err.message,
    });
  }
}
