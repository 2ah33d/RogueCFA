import { supabase } from './_supabaseClient.js';
import { parseDateFromTitle } from './_pipeline.js';

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    /* ── Automated Retention Pruning: Only clean up failed/incomplete jobs older than 90 days ── */
    try {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      supabase
        .from('digest_jobs')
        .delete()
        .neq('status', 'complete')
        .lt('episode_date', cutoffDate)
        .then(({ error: pruneErr }) => {
          if (pruneErr) console.warn('[marketcall-history] Retention cleanup error:', pruneErr.message);
        });
    } catch {
      /* ignore */
    }

    /* Fetch complete digests ordered by episode_date descending, then created_at descending */
    let data = null;
    let error = null;
    let availableAudioDates = [];

    try {
      const [dbRes, storageRes] = await Promise.all([
        supabase
          .from('digest_jobs')
          .select('id, episode_date, video_id, video_title, result, created_at, updated_at')
          .eq('status', 'complete')
          .not('result', 'is', null)
          .order('episode_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.storage
          .from('marketcall-audio')
          .list('', { limit: 50 })
          .catch(() => ({ data: [] })),
      ]);

      data = dbRes.data;
      error = dbRes.error;

      if (storageRes?.data && Array.isArray(storageRes.data)) {
        availableAudioDates = storageRes.data
          .map((f) => f.name?.match(/marketcall-(\d{4}-\d{2}-\d{2})\.m4a/)?.[1])
          .filter(Boolean)
          .sort()
          .reverse();
      }
    } catch (e) {
      error = e;
    }

    if (error || !data) {
      /* Fallback to direct REST fetch to bypass JWT clock skew (JWT issued at future) */
      try {
        const sUrl = process.env.SUPABASE_URL;
        const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sUrl && sKey) {
          const restUrl = `${sUrl}/rest/v1/digest_jobs?select=id,episode_date,video_id,video_title,result,created_at,updated_at&status=eq.complete&result=not.is.null&order=episode_date.desc,created_at.desc`;
          const restRes = await fetch(restUrl, {
            headers: { 'apikey': sKey, 'Authorization': `Bearer ${sKey}` },
          });
          if (restRes.ok) {
            data = await restRes.json();
            error = null;
          }
        }
      } catch (restErr) {
        console.warn('[marketcall-history] REST fallback failed:', restErr.message);
      }
    }

    if (error && !data) {
      console.error('[marketcall-history] Database error:', error.message);
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    /* Deduplicate by episode_date so each BNN episode date appears exactly once in chronological order */
    const seenDates = new Set();
    const uniqueHistory = [];

    for (const row of data || []) {
      const dateKey = row.episode_date || row.result?.episodeDate || 'unknown';

      /* Filter out weekend dates (MarketCall only airs Monday-Friday) */
      if (dateKey && dateKey !== 'unknown') {
        const dateObj = new Date(`${dateKey}T12:00:00Z`);
        const dayOfWeek = dateObj.getUTCDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip 0 (Sun) & 6 (Sat)
      }

      /* Filter out malformed phonetic mishearings from prior Whisper runs */
      const guestName = (row.result?.digest?.guest || '').toLowerCase();
      if (guestName.includes('nono-wamden') || guestName.includes('nono wamden')) {
        continue;
      }

      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);

        let videoId = row.video_id || row.result?.videoId || '';
        let videoTitle = row.video_title || row.result?.videoTitle || `BNN Bloomberg Market Call (${dateKey})`;
        let youtubePending = Boolean(row.result?.youtubePending || !videoId);

        /* Date verification: If video title has an explicit date that does NOT match dateKey, strip it! */
        const titleDate = parseDateFromTitle(videoTitle);
        if (titleDate && titleDate !== dateKey) {
          videoId = '';
          videoTitle = `BNN Bloomberg Market Call (Live Audio Capture - ${dateKey})`;
          youtubePending = true;

          /* Async cleanup in database */
          supabase
            .from('digest_jobs')
            .update({
              video_id: '',
              video_title: videoTitle,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
            .then(({ error: cleanErr }) => {
              if (cleanErr) console.warn('[marketcall-history] Async clean error:', cleanErr.message);
            });
        }

        uniqueHistory.push({
          id: row.id,
          episodeDate: dateKey,
          videoId,
          videoTitle,
          youtubePending,
          digest: row.result?.digest || null,
          goldenGoose: row.result?.goldenGoose || null,
          generatedAt: row.result?.generatedAt || row.updated_at || row.created_at,
        });
      }
    }

    const paginated = uniqueHistory.slice(offset, offset + limit);

    return res.status(200).json({
      count: uniqueHistory.length,
      limit,
      offset,
      history: paginated,
      availableAudioDates,
    });
  } catch (err) {
    console.error('[marketcall-history] Handler exception:', err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
