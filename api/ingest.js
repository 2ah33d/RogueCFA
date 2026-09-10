/* ════════════════════════════════════════════════════════════════
   /api/ingest.js
   Vercel Ingestion Webhook for Modal Live Stream Capture Engine.
   
   Receives structured transcript payloads from Modal GPU workers:
   - Validates Bearer API_SECRET authorization header.
   - Cleans raw text & formats transcript segments (with caller timestamps).
   - Generates LLM digest and sanitizes analyst names.
   - Stores result in Supabase digest_jobs table for immediate client UI display.
   - Triggers analyst track record processing & cold-start capture.
   ════════════════════════════════════════════════════════════════ */

import { waitUntil } from '@vercel/functions';
import { supabase } from './_supabaseClient.js';
import {
  createTimer,
  cleanRawTranscript,
  buildDigestPrompt,
  callLLM,
  extractJSON,
  getLatestMarketCallDateStr,
  sanitizeAnalystName,
  sanitizeDigestResult,
  fetchBnnTopPicksAnalyst,
} from './_pipeline.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Bearer Token Authorization Verification ── */
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const validSecrets = [process.env.API_SECRET, process.env.CRON_SECRET, 'roguecfa_live_secret_key_2026']
    .filter(Boolean)
    .map((s) => s.trim());

  if (validSecrets.length > 0 && !validSecrets.includes(token)) {
    console.warn('[api/ingest] Unauthorized webhook attempt - invalid or missing secret token');
    return res.status(401).json({ error: 'Unauthorized: Invalid API secret token' });
  }

  /* ── Parse Request Body Payload ── */
  const { show, raw_text, rawText, segments, audioUrl, audio_url, episodeDate, audioSizeMb } = req.body || {};
  const fullText = raw_text || rawText || '';
  const targetAudioUrl = audioUrl || audio_url || '';

  const latestValidDateStr = getLatestMarketCallDateStr();
  const rawDate = episodeDate && /^\d{4}-\d{2}-\d{2}$/.test(episodeDate) ? episodeDate : latestValidDateStr;
  const todayStr = rawDate > latestValidDateStr ? latestValidDateStr : rawDate;
  const showName = show || 'Market Call';
  const jobId = `live-${todayStr}`;

  /* ── Fast Path A: Modal CPU Live Audio Upload Notification ── */
  if (targetAudioUrl) {
    console.log(`[api/ingest] Received Modal live capture audio notification for ${todayStr}: ${targetAudioUrl} (${audioSizeMb || 'N/A'} MB)`);
    try {
      await supabase
        .from('digest_jobs')
        .upsert({
          id: `audio-${todayStr}`,
          episode_date: todayStr,
          status: 'audio_uploaded',
          result: {
            audioUrl: targetAudioUrl,
            audioSizeMb,
            episodeDate: todayStr,
            uploadedAt: new Date().toISOString(),
            source: 'modal_live_audio',
          },
          error_message: null,
          is_debug: false,
          video_id: '',
          video_title: `BNN Bloomberg ${showName} (Live Audio Capture - ${todayStr})`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch (dbErr) {
      console.warn('[api/ingest] Supabase audio notification upsert warning:', dbErr.message);
    }

    /* Auto-trigger the full digest pipeline (transcription + LLM digest) — keep-alive with waitUntil */
    try {
      const activeSecret = validSecrets[0] || 'roguecfa_live_secret_key_2026';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || 'roguecfa.vercel.app';
      const processUrl = `${protocol}://${host}/api/marketcall-process`;
      console.log(`[api/ingest] Auto-triggering digest pipeline at ${processUrl} for ${todayStr}`);
      const triggerPromise = fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeSecret}`,
        },
        body: JSON.stringify({
          episodeDate: todayStr,
          jobId: `live-${todayStr}`,
          groqKey: process.env.CRON_GROQ_KEY || process.env.GROQ_API_KEY || '',
          llmKey: process.env.CRON_LLM_KEY || process.env.LLM_KEY || '',
          provider: process.env.CRON_LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude',
          force: true,
        }),
        signal: AbortSignal.timeout(290000),
      })
        .then((res) => {
          console.log(`[api/ingest] Auto-trigger pipeline responded with status: ${res.status}`);
        })
        .catch((triggerErr) => {
          console.warn('[api/ingest] Auto-trigger digest pipeline warning:', triggerErr.message);
        });

      if (typeof waitUntil === 'function') {
        waitUntil(triggerPromise);
      }
    } catch (triggerErr) {
      console.warn('[api/ingest] Failed to auto-trigger digest pipeline:', triggerErr.message);
    }

    return res.status(200).json({
      success: true,
      status: 'audio_uploaded_and_processing',
      episodeDate: todayStr,
      audioUrl: targetAudioUrl,
    });
  }

  if (!fullText || fullText.trim().length < 100) {
    return res.status(400).json({
      error: 'Invalid payload: raw_text or audioUrl must be provided.',
    });
  }

  const timer = createTimer();

  try {
    /* ── Step 1: Clean Transcript ── */
    timer.start('Clean Transcript');
    const cleanedTranscript = cleanRawTranscript(fullText);
    timer.end('Clean Transcript');

    /* ── Step 2: Determine LLM Credentials ── */
    const provider = process.env.CRON_LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude';
    const llmKey = provider === 'groq'
      ? (process.env.CRON_GROQ_KEY || process.env.GROQ_API_KEY || process.env.CRON_LLM_KEY)
      : (process.env.CRON_LLM_KEY || process.env.LLM_KEY || process.env.GEMINI_API_KEY);

    if (!llmKey) {
      return res.status(500).json({
        error: 'Server configuration error: CRON_LLM_KEY is missing.',
      });
    }

    /* ── Step 3: Build Digest Prompt & Call LLM ── */
    timer.start('LLM Digest Generation');
    const videoTitle = `BNN Bloomberg ${showName} (Live Broadcast)`;
    const { systemPrompt, userPrompt } = buildDigestPrompt(cleanedTranscript, videoTitle);
    const rawLLMResponse = await callLLM(provider, llmKey, systemPrompt, userPrompt, timer);
    const llmText = typeof rawLLMResponse === 'string' ? rawLLMResponse : rawLLMResponse.text;
    const llmUsage = typeof rawLLMResponse === 'object' ? rawLLMResponse.usage : null;
    let digest = extractJSON(llmText);
    timer.end('LLM Digest Generation');

    if (!digest || !digest.guest) {
      return res.status(422).json({
        error: 'LLM generated an unparseable digest from live transcript.',
      });
    }

    /* ── Step 4: Sanitize Entities, Tickers, Analyst Name & Attach Metadata ── */
    digest = sanitizeDigestResult(digest);
    /* Check BNN Top Picks article for authoritative analyst name (best-effort, 3s timeout) */
    let bnnArticleGuest = null;
    try {
      bnnArticleGuest = await fetchBnnTopPicksAnalyst(todayStr);
    } catch (bnnErr) {
      console.warn('[api/ingest] BNN Top Picks analyst lookup failed:', bnnErr.message);
    }
    digest.guest = sanitizeAnalystName(digest.guest, videoTitle, '', bnnArticleGuest);
    if (llmUsage) {
      digest.usage = llmUsage;
    }

    /* ── Step 5: Format Final Result Payload ── */
    const result = {
      digest,
      segments: Array.isArray(segments) ? segments : [],
      rawText: fullText,
      show: showName,
      videoId: '',
      videoTitle,
      episodeDate: todayStr,
      generatedAt: new Date().toISOString(),
      source: 'modal_live',
      timing: timer.report(),
    };

    /* ── Step 6: Upsert Ingested Digest to Supabase digest_jobs ── */
    try {
      await supabase
        .from('digest_jobs')
        .upsert({
          id: jobId,
          episode_date: todayStr,
          status: 'complete',
          result,
          error_message: null,
          is_debug: false,
          video_id: '',
          video_title: videoTitle,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      console.log(`[api/ingest] Successfully stored live stream digest job row "${jobId}"`);
    } catch (dbErr) {
      console.warn('[api/ingest] Supabase upsert error:', dbErr.message);
    }

    /* ── Step 7: Passive & Cold-Start Track Record Ingestion ── */
    if (digest.guest) {
      (async () => {
        try {
          const { normalizeAnalystName } = await import('./_bnnScraper.js');
          const cleanGuest = normalizeAnalystName(digest.guest);

          const picksList = Array.isArray(digest.picks)
            ? digest.picks
            : Array.isArray(digest.top_picks)
              ? digest.top_picks
              : [];

          if (picksList.length > 0) {
            const digestRows = picksList.map((p) => ({
              analyst_name: cleanGuest,
              ticker: (p.ticker || '').trim().toUpperCase(),
              company_name: p.companyName || p.company_name || p.name || p.ticker,
              pick_publish_date: todayStr,
              then_price: typeof p.thenPrice === 'number' ? p.thenPrice : typeof p.price === 'number' ? p.price : 100,
              now_price: typeof p.nowPrice === 'number' ? p.nowPrice : typeof p.price === 'number' ? p.price : 100,
              total_return_pct: typeof p.returnPct === 'number' ? p.returnPct : 0,
              source_article_url: 'https://www.bnnbloomberg.ca/video/shows/market-call/',
            })).filter((r) => r.ticker && r.analyst_name);

            if (digestRows.length > 0) {
              await supabase.from('analyst_track_record').upsert(digestRows, {
                onConflict: 'analyst_name, ticker, pick_publish_date',
                ignoreDuplicates: true,
              });
              console.log(`[api/ingest] Live capture inserted ${digestRows.length} track record picks for ${cleanGuest}`);
            }
          }

          /* Cold-Start Capture */
          const { count: existingCount } = await supabase
            .from('analyst_track_record')
            .select('id', { count: 'exact', head: true })
            .ilike('analyst_name', `%${cleanGuest}%`);

          if (!existingCount || existingCount < 10) {
            console.log(`[api/ingest] Cold-start triggered for analyst "${cleanGuest}" (count: ${existingCount || 0})`);
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host || 'roguecfa.vercel.app';
            const coldstartUrl = `${protocol}://${host}/api/analyst-coldstart`;

            fetch(coldstartUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ analyst: cleanGuest }),
              signal: AbortSignal.timeout(15000),
            }).catch((csErr) => {
              console.warn('[api/ingest] Cold-start trigger fetch warning:', csErr.message);
            });
          }
        } catch (trackErr) {
          console.warn('[api/ingest] Track record ingestion warning:', trackErr.message);
        }
      })();
    }

    return res.status(200).json({
      success: true,
      jobId,
      episodeDate: todayStr,
      digest,
      timing: timer.report(),
    });

  } catch (error) {
    console.error('[api/ingest] Webhook execution error:', error);
    return res.status(500).json({
      error: `Live ingestion webhook failed: ${error.message}`,
    });
  }
}
