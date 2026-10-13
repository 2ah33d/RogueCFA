/* ════════════════════════════════════════════════════════════════
   /api/marketcall-status.js
   Lightweight polling endpoint for checking digest job status.
   Client polls this every ~5s after kicking off processing.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from './_supabaseClient.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jobId = req.query.jobId;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId query parameter is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('digest_jobs')
      .select('id, status, result, error_message, current_stage, episode_date, video_id, video_title, created_at, updated_at')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      console.error('[marketcall-status] Supabase query error:', error.message);
      return res.status(500).json({ error: 'Failed to check job status.' });
    }

    if (!data) {
      return res.status(404).json({
        error: 'Job not found.',
        jobId,
        status: 'not_found',
      });
    }

    const response = {
      jobId: data.id,
      status: data.status,
      episodeDate: data.episode_date,
      currentStage: data.current_stage || 'Initializing...',
    };

    if (data.status === 'complete' && data.result) {
      response.result = data.result;
    }

    if ((data.status === 'error' || data.status === 'date_mismatch') && data.error_message) {
      response.error = data.error_message;
      response.status = data.status;
      response.videoId = data.video_id;
      response.videoTitle = data.video_title;
    }

    /* Include elapsed time so the client can show "Processing for Xs..." */
    if (data.status === 'processing' && data.created_at) {
      const elapsed = Math.round((Date.now() - new Date(data.created_at).getTime()) / 1000);
      response.elapsedSeconds = elapsed;
    }

    return res.status(200).json(response);

  } catch (err) {
    console.error('[marketcall-status] Error:', err);
    return res.status(500).json({ error: `Status check failed: ${err.message}` });
  }
}
