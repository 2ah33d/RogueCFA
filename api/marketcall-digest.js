/* ════════════════════════════════════════════════════════════════
   /api/marketcall-digest.js
   Smart router: handles extension-provided transcripts inline,
   checks Supabase cache for today's digest, and returns a job ID
   for the client to kick off /api/marketcall-process independently.
   
   This route always responds in < 2s. No internal server-to-server
   fetch, no waitUntil — pure routing.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from './_supabaseClient.js';
import {
  createTimer,
  cleanRawTranscript,
  buildDigestPrompt,
  callLLM,
  extractJSON,
  getLatestMarketCallDateStr,
  findRecentMarketCallVideos,
  findMatchingYtVideo,
  sanitizeAnalystName,
} from './_pipeline.js';

export const config = { maxDuration: 60 };

/**
 * Generate a deterministic job ID for today's episode.
 * 10-minute windows for dedup: retries in the same window reuse the same job.
 */
function generateJobId(episodeDate) {
  const dateStr = episodeDate || getLatestMarketCallDateStr();
  const windowKey = Math.floor(Date.now() / 600000);
  const hash = (windowKey * 2654435761 >>> 0).toString(36).slice(0, 4);
  return `mc-${dateStr}-${hash}`;
}

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    youtubeKey: bodyYoutubeKey, llmKey: bodyLlmKey, provider: bodyProvider, groqKey: bodyGroqKey,
    /* Client-provided transcript (from Chrome extension) */
    transcript: clientTranscript,
    videoId: clientVideoId,
    videoTitle: clientVideoTitle,
    episodeDate: clientEpisodeDate,
  } = req.body || {};

  const youtubeKey = bodyYoutubeKey || process.env.CRON_YOUTUBE_KEY || process.env.VITE_YOUTUBE_KEY || process.env.YOUTUBE_KEY || '';
  const groqKey = bodyGroqKey || process.env.CRON_GROQ_KEY || process.env.VITE_GROQ_KEY || process.env.GROQ_KEY || '';

  let provider, llmKey;
  if (bodyLlmKey && bodyLlmKey.trim()) {
    llmKey = bodyLlmKey.trim();
    provider = bodyProvider || 'gemini';
  } else {
    provider = process.env.CRON_LLM_PROVIDER || process.env.LLM_PROVIDER || 'gemini';
    llmKey = provider === 'groq'
      ? (process.env.CRON_GROQ_KEY || process.env.CRON_LLM_KEY || process.env.LLM_KEY)
      : (process.env.CRON_LLM_KEY || process.env.LLM_KEY || process.env.OPENAI_API_KEY || '');
  }

  if (!llmKey || !provider) {
    return res.status(400).json({
      error: 'LLM key and provider are required.',
    });
  }

  try {
    /* ══════════════════════════════════════════
       Fast path A: Client-provided transcript
       (Chrome extension extracted it from the user's browser)
       — runs inline, typically < 15s (just one LLM call)
       ══════════════════════════════════════════ */
    if (clientTranscript && clientTranscript.length >= 200) {
      const timer = createTimer();
      const cleanedTranscript = cleanRawTranscript(clientTranscript);
      if (cleanedTranscript.length < 200) {
        return res.status(200).json({
          error: 'no_transcript',
          message: 'The transcript provided by the extension was too short after cleaning. Try a different episode.',
        });
      }

      const { systemPrompt, userPrompt } = buildDigestPrompt(cleanedTranscript, clientVideoTitle || '');
      const rawLLMResponse = await callLLM(provider, llmKey, systemPrompt, userPrompt, timer);
      const llmText = typeof rawLLMResponse === 'string' ? rawLLMResponse : rawLLMResponse.text;
      const llmUsage = typeof rawLLMResponse === 'object' ? rawLLMResponse.usage : null;
      const digest = extractJSON(llmText);

      if (!digest || !digest.guest) {
        return res.status(422).json({
          error: 'LLM returned an unparseable digest. Try again.',
        });
      }

      /* Sanitize analyst name against YouTube video title & phonetic mishearing dictionary */
      if (digest && digest.guest) {
        digest.guest = sanitizeAnalystName(digest.guest, clientVideoTitle || '');
      }

      /* Attach usage to digest so frontend can show real costs */
      if (llmUsage) {
        digest.usage = llmUsage;
      }

      return res.status(200).json({
        digest,
        videoId: clientVideoId || '',
        videoTitle: clientVideoTitle || '',
        episodeDate: clientEpisodeDate || '',
        generatedAt: new Date().toISOString(),
        source: 'extension',
      });
    }

    /* ══════════════════════════════════════════
       Fast path B: Check Supabase cache for target episode digest
       — returns in < 1s if a previous run already completed
       (Bypassed if user explicitly clicked 'Renew' with force: true)
       ══════════════════════════════════════════ */
    const { force, bypassCache } = req.body || {};
    const rawDate = req.body?.episodeDate || clientEpisodeDate;
    const targetDateStr = (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate))
      ? rawDate
      : getLatestMarketCallDateStr();

    const latestValidBroadcastDate = getLatestMarketCallDateStr();
    if (targetDateStr > latestValidBroadcastDate) {
      return res.status(400).json({
        error: `Market Call episode for ${targetDateStr} has not aired yet. Broadcasts air Mon-Fri at 12:00 PM EST (9:00 AM PST).`,
      });
    }

    if (!force && !bypassCache) {
      try {
        const { data: cached } = await supabase
          .from('digest_jobs')
          .select('id, status, result, error_message, video_id, video_title')
          .eq('episode_date', targetDateStr)
          .eq('status', 'complete')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cached && cached.result) {
          /* Backfill YouTube videoId & analyst name if missing in cached result */
          if (youtubeKey && (!cached.result.videoId || cached.result.videoId.trim() === '')) {
            try {
              let candidateVideos = (await findRecentMarketCallVideos(youtubeKey)) || [];
              if (candidateVideos.length === 0) {
                const { discoverMarketCallVideos } = await import('./_youtubeFetcher.js');
                candidateVideos = (await discoverMarketCallVideos(targetDateStr, youtubeKey)) || [];
              }
              const matchingYtVid = findMatchingYtVideo(candidateVideos, targetDateStr);
              if (matchingYtVid && matchingYtVid.videoId) {
                cached.result.videoId = matchingYtVid.videoId;
                cached.result.videoTitle = matchingYtVid.videoTitle || cached.result.videoTitle;
                if (cached.result.digest && cached.result.digest.guest) {
                  cached.result.digest.guest = sanitizeAnalystName(cached.result.digest.guest, matchingYtVid.videoTitle, matchingYtVid.description, '', targetDateStr);
                }
                /* Persist updated result & video_id to Supabase */
                supabase
                  .from('digest_jobs')
                  .update({
                    video_id: matchingYtVid.videoId,
                    video_title: matchingYtVid.videoTitle,
                    result: cached.result,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', cached.id)
                  .then(({ error }) => {
                    if (error) console.warn('[marketcall-digest] Failed to persist YouTube backfill:', error.message);
                  });
              }
            } catch (backfillErr) {
              console.warn('[marketcall-digest] YouTube backfill check failed:', backfillErr.message);
            }
          }
          return res.status(200).json(cached.result);
        }
      } catch (cacheErr) {
        console.warn('[marketcall-digest] Cache check failed:', cacheErr.message);
      }
    } else {
      /* Force refresh / Renew: delete error and stale processing jobs for targetDateStr so pipeline runs fresh while preserving completed live captures */
      try {
        await supabase
          .from('digest_jobs')
          .delete()
          .eq('episode_date', targetDateStr)
          .in('status', ['error', 'processing']);
      } catch {
        /* ignore */
      }
    }

    /* ══════════════════════════════════════════
       Standard path: Create job row and return jobId.
       The CLIENT will fire /api/marketcall-process separately.
       No server-to-server fetch, no waitUntil.
       ══════════════════════════════════════════ */
    if (!youtubeKey && (!groqKey || !groqKey.startsWith('gsk_'))) {
      return res.status(400).json({
        error: 'YouTube API key or Groq API key is required. Add one in Settings, or use the Chrome extension to provide transcripts directly.',
      });
    }

    const jobId = (force || bypassCache) ? `renew-${targetDateStr}-${Date.now()}` : generateJobId(targetDateStr);

    /* Check if there's already an active job for targetDateStr (skip if force refresh) */
    if (!force && !bypassCache) {
      try {
        const { data: existingJob } = await supabase
          .from('digest_jobs')
          .select('id, status, error_message, created_at')
          .eq('episode_date', targetDateStr)
          .in('status', ['processing', 'complete'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingJob) {
          if (existingJob.status === 'complete') {
            return res.status(200).json({ status: 'complete', jobId: existingJob.id });
          }
          /* If processing, check for staleness */
          const jobAge = Date.now() - new Date(existingJob.created_at).getTime();
          if (jobAge > 5 * 60 * 1000) {
            console.warn(`[marketcall-digest] Stale job ${existingJob.id} — marking as error`);
            await supabase
              .from('digest_jobs')
              .update({ status: 'error', error_message: 'Job timed out', updated_at: new Date().toISOString() })
              .eq('id', existingJob.id);
            /* Fall through to create fresh job */
          } else {
            /* Active job — tell client to poll it AND kick off process (idempotent) */
            return res.status(200).json({
              status: 'processing',
              jobId: existingJob.id,
              message: 'Digest is being generated.',
            });
          }
        }
      } catch {
        /* proceed */
      }
    }

    /* Create fresh job row */
    try {
      await supabase
        .from('digest_jobs')
        .upsert({
          id: jobId,
          episode_date: targetDateStr,
          status: 'processing',
          result: null,
          error_message: null,
          is_debug: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch (dbErr) {
      console.warn('[marketcall-digest] Failed to create job row:', dbErr.message);
    }

    /* Return immediately — client will fire /api/marketcall-process */
    return res.status(200).json({
      status: 'processing',
      jobId,
      message: 'Job created. Starting processing...',
    });

  } catch (error) {
    console.error('MarketCall digest error:', error);
    return res.status(500).json({
      error: `Digest generation failed: ${error.message}`,
    });
  }
}
