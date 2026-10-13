/* ════════════════════════════════════════════════════════════════
   digestBuilder.js
   Constructs the summarization prompt for MarketCall transcripts
   and cleans raw YouTube caption segments.
   ════════════════════════════════════════════════════════════════ */

/**
 * Clean raw YouTube transcript segments into a single readable text block.
 * Strips [music], [applause], duplicate overlapping segments, and timestamps.
 *
 * @param {Array<{text: string, offset?: number, duration?: number}>} segments
 * @returns {string} Cleaned transcript text
 */
export function cleanTranscript(segments) {
  if (!segments || !Array.isArray(segments)) return '';

  const seen = new Set();
  const lines = [];

  for (const seg of segments) {
    if (!seg || typeof seg.text !== 'string') continue;

    let text = seg.text
      .replace(/\[music\]/gi, '')
      .replace(/\[applause\]/gi, '')
      .replace(/\[laughter\]/gi, '')
      .replace(/\[inaudible\]/gi, '')
      .replace(/\[silence\]/gi, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n/g, ' ')
      .trim();

    if (!text || text.length < 2) continue;

    /* Deduplicate overlapping caption chunks */
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push(text);
  }

  return lines.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Build the system + user prompt pair for digest summarization.
 * The LLM receives the full transcript and must produce a structured digest.
 *
 * @param {string} transcript - Cleaned transcript text
 * @param {string} videoTitle - YouTube video title (for context)
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildDigestPrompt(transcript, videoTitle = '') {
  const systemPrompt = `You are a financial research assistant that summarizes BNN Bloomberg MarketCall episodes.
Your job is to produce a structured digest from the provided episode transcript.

STRICT RULES:
1. ONLY reference what the guest ACTUALLY SAID in the transcript. Do NOT add outside analysis, opinion, or information not present in the transcript.
2. Preserve the guest's SPECIFIC language and reasoning — not generic boilerplate. Instead of "the guest is bullish on energy", quote their actual logic: their stated thesis, metrics, catalysts, and price targets.
3. Every stock pick MUST include the guest's stated reasoning (WHY they like it). A bare ticker list is worthless.
4. Output 500–1000 words total.
5. If the guest mentions a price target, timeframe, or specific catalyst, include it.
6. CRITICAL DISTINCTION FOR PICKS VS CALLER Q&A:
   - "picks": MUST contain EXACTLY the guest's NEW official featured Top Picks (typically 3 stocks) introduced for today's market.
   - "callerMentions": MUST contain any additional stocks discussed by the guest when answering caller questions or viewer emails during the Q&A segment. DO NOT mix caller Q&A stocks into "picks".
7. EXCLUDE PAST PICKS REVIEWS: Do NOT include historical "Past Picks" reviewed during the episode (where the host/guest evaluate performance from prior months, e.g. "Looking back at your picks from 6 months ago... Then: $X Now: $Y"). "picks" MUST ONLY contain NEW, CURRENT actionable Top Picks. Do NOT put past picks in "picks" or "callerMentions".
8. ANALYST STANCE / EVALUATION: For each stock in "callerMentions" (and "picks"), analyze the guest analyst's verbal assessment, sentiment, and recommendation to determine their explicit stance:
   - "buy": Analyst explicitly recommends buying, adding, or gives a clear positive/bullish recommendation.
   - "sell": Analyst explicitly recommends selling, trimming, avoiding, or gives a clear negative/bearish stance.
   - "hold": Analyst recommends holding, neutral posture, wait-and-see, or fair valuation.
   - "unsure": Analyst is uncertain, hesitant, declined to take a position, or gives a mixed/ambiguous opinion.
9. RISK-REWARD & EXECUTION STRUCTURE:
   - Note any stated target prices, current trading prices, and expected upside delta.
   - If an analyst cites stretched/high valuation and advises a defensive structure (e.g. selling short-dated covered calls to manufacture yield, advising staged limit buy orders down 10-15% as downside buffers, or avoiding a full position), explicitly detail this in the reasoning. Do NOT present defensive covered-call yield trades or capped-upside hedges as high-conviction directional long bets.

OUTPUT FORMAT — respond with valid JSON only, no markdown fences:
{
  "guest": "Full Name",
  "firm": "Firm/Title",
  "episodeFocus": "Stated theme of the episode, e.g. Technical Analysis / Energy Sector Outlook",
  "marketOutlook": {
    "takeaway": "1-2 sentence (20-35 words) high-signal key takeaway summarizing the guest's core market thesis & posture.",
    "details": "100-150 word detailed breakdown of the guest's market view, rate/inflation logic, sector allocations, and macroeconomic rationale."
  },
  "picks": [
    {
      "ticker": "TICKER",
      "company": "Company Name",
      "reasoning": "80-150 words condensing the guest's own logic for this official top pick — WHY they like it, any stated price target or timeframe, any specific catalyst or metric they referenced.",
      "stance": "buy"
    }
  ],
  "callerMentions": [
    {
      "ticker": "TICKER",
      "company": "Company Name",
      "reasoning": "60-120 words condensing what the guest said about this stock when answering a caller question (buy/sell/hold stance, technicals/fundamentals, risks or valuation concerns).",
      "stance": "buy" | "sell" | "hold" | "unsure"
    }
  ],
  "pastPicks": [
    {
      "ticker": "TICKER",
      "company": "Company Name",
      "reasoning": "40-80 words summarizing the past pick evaluation, performance since prior pick date, and current posture (held/exited).",
      "stance": "buy" | "sell" | "hold" | "unsure"
    }
  ],
  "closingNotes": "Optional 50-100 words. Any general macro risks or concluding thoughts the guest mentioned. Empty string if none."
}`;

  const userPrompt = `Here is the transcript from today's BNN Bloomberg MarketCall episode${videoTitle ? ` titled "${videoTitle}"` : ''}:

---BEGIN TRANSCRIPT---
${transcript}
---END TRANSCRIPT---

Produce the structured digest following the exact JSON format specified. Remember: "picks" must ONLY contain NEW official featured Top Picks (usually 3), EXCLUDING any past picks reviews from prior months. All caller Q&A stock discussions belong in "callerMentions".`;

  return { systemPrompt, userPrompt };
}
