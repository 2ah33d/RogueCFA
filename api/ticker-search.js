import { supabase } from './_supabaseClient.js';

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const q = (req.query.q || '').trim();
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'latest';
    const stanceFilter = (req.query.stance || '').trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    /* If no query is provided, return empty results immediately */
    if (!q) {
      return res.status(200).json({
        query: '',
        sort,
        stanceFilter,
        total: 0,
        limit,
        offset: 0,
        hasMore: false,
        results: [],
      });
    }

    /* Fetch all completed digest jobs from Supabase */
    const { data: dbRows, error: dbError } = await supabase
      .from('digest_jobs')
      .select('id, episode_date, video_id, video_title, result')
      .eq('status', 'complete')
      .not('result', 'is', null)
      .order('episode_date', { ascending: sort === 'oldest' });

    if (dbError) {
      console.error('[ticker-search] Supabase query error:', dbError.message);
      return res.status(500).json({ error: `Database query failed: ${dbError.message}` });
    }

    const cleanQ = q.toUpperCase();
    const cleanQNoDot = cleanQ.replace('.TO', '');

    const allMentions = [];

    for (const row of dbRows || []) {
      const digest = row.result?.digest;
      if (!digest) continue;

      const guest = digest.guest || 'MarketCall Analyst';
      const date = row.episode_date || row.result?.episodeDate || 'Recent';
      const videoId = row.video_id || row.result?.videoId || '';
      const videoTitle = row.video_title || row.result?.videoTitle || `BNN Bloomberg MarketCall (${date})`;

      const picks = (digest.picks || digest.top_picks || []).map((p, idx) => ({
        ...p,
        mentionId: `${date}_${guest}_pick_${idx}`,
        segment: 'Top Pick',
        stance: (p.stance || p.rating || 'buy').toLowerCase(),
        guest,
        date,
        videoId,
        videoTitle,
      }));

      const callers = (digest.callerMentions || digest.caller_mentions || []).map((c, idx) => ({
        ...c,
        mentionId: `${date}_${guest}_caller_${idx}`,
        segment: 'Caller Q&A',
        stance: (c.stance || c.rating || 'hold').toLowerCase(),
        guest,
        date,
        videoId,
        videoTitle,
      }));

      const past = (digest.pastPicks || []).map((p, idx) => ({
        ...p,
        mentionId: `${date}_${guest}_past_${idx}`,
        segment: 'Past Pick',
        stance: (p.stance || p.rating || 'hold').toLowerCase(),
        guest,
        date,
        videoId,
        videoTitle,
      }));

      for (const m of [...picks, ...callers, ...past]) {
        const ticker = (m.ticker || '').trim().toUpperCase();
        if (!ticker) continue;
        const tickerNoDot = ticker.replace('.TO', '');
        const company = (m.company || m.companyName || m.company_name || ticker).trim();
        const companyUpper = company.toUpperCase();

        let matches = false;
        let priority = 3; // 1 = exact ticker, 2 = startsWith ticker, 3 = contains ticker, 4 = company name

        if (!cleanQ) {
          matches = true;
          priority = 3;
        } else if (ticker === cleanQ || tickerNoDot === cleanQNoDot) {
          matches = true;
          priority = 1;
        } else if (ticker.startsWith(cleanQ) || tickerNoDot.startsWith(cleanQNoDot)) {
          matches = true;
          priority = 2;
        } else if (ticker.includes(cleanQ) || tickerNoDot.includes(cleanQNoDot)) {
          matches = true;
          priority = 3;
        } else if (companyUpper.includes(cleanQ)) {
          matches = true;
          priority = 4;
        }

        if (matches) {
          /* Apply stance filter if specified */
          if (stanceFilter && stanceFilter !== 'all') {
            const s = m.stance.toLowerCase();
            if (stanceFilter === 'buy' && !s.includes('buy')) continue;
            if (stanceFilter === 'hold' && !s.includes('hold') && !s.includes('neutral')) continue;
            if (stanceFilter === 'sell' && !s.includes('sell') && !s.includes('avoid')) continue;
          }

          allMentions.push({
            id: m.mentionId,
            ticker,
            company,
            stance: m.stance,
            segment: m.segment,
            guest: m.guest,
            date: m.date,
            reasoning: m.reasoning || m.summary || m.thesis || m.commentary || 'Mentioned during MarketCall broadcast.',
            videoId: m.videoId,
            videoTitle: m.videoTitle,
            priority,
          });
        }
      }
    }

    /* Sort results */
    allMentions.sort((a, b) => {
      // If user typed a search query, rank exact/closer matches higher
      if (cleanQ && a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then order chronologically by date
      if (sort === 'oldest') {
        return a.date.localeCompare(b.date);
      }
      return b.date.localeCompare(a.date);
    });

    const totalCount = allMentions.length;
    const paginated = allMentions.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return res.status(200).json({
      query: q,
      sort,
      stanceFilter,
      total: totalCount,
      limit,
      offset,
      hasMore,
      results: paginated,
    });
  } catch (err) {
    console.error('[ticker-search] Handler exception:', err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
