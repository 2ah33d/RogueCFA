/**
 * api/_youtubeFetcher.js
 * @deprecated [LEGACY YOUTUBE FALLBACK]
 * YouTube-based audio pipeline for BNN Bloomberg MarketCall episode discovery,
 * audio extraction via external Python yt-dlp micro-worker, and Groq Whisper transcription.
 *
 * Primary production pipeline now uses modal_app/live_capture.py (Modal Live Stream Capture Engine).
 * All code in this module is preserved intact as a fallback reference.
 */

import { getLatestMarketCallDateStr } from './_pipeline.js';

const BNN_YOUTUBE_CHANNEL_ID = 'UC5aNPmKYwbudeNngDMTY3lw';
const BNN_CHANNEL_URL = 'https://www.youtube.com/@BNNBloomberg/videos';

/**
 * Discover today's BNN Bloomberg MarketCall episode video ID(s) from YouTube.
 *
 * Strategy:
 *   1. YouTube Data API (if CRON_YOUTUBE_KEY is available) — most reliable
 *   2. YouTube channel page scraping — zero-cost fallback
 *
 * @param {string} todayStr - Target date string (YYYY-MM-DD)
 * @param {string} [youtubeApiKey] - Optional YouTube Data API key
 * @param {object} [timer] - Optional timing instrumentation
 * @returns {Promise<{videoId: string, title: string, publishDate: string}[]>} - Array of matching video objects
 */
export async function discoverMarketCallVideos(todayStr, youtubeApiKey, timer) {
  if (!todayStr) todayStr = getLatestMarketCallDateStr();

  /* Strategy 1: YouTube Data API search (if key available) */
  if (youtubeApiKey) {
    try {
      timer?.start('YouTube Data API search');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${BNN_YOUTUBE_CHANNEL_ID}&q=Market+Call&type=video&order=date&maxResults=15&key=${youtubeApiKey}`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
      timer?.end('YouTube Data API search');

      if (res.ok) {
        const data = await res.json();
        const items = (data.items || [])
          .filter((item) => {
            const title = (item.snippet?.title || '').toLowerCase();
            return isMarketCallVideoTitle(title);
          })
          .map((item) => {
            const rawTitle = item.snippet?.title || '';
            const pubDate = (item.snippet?.publishedAt || '').split('T')[0];
            const extractedDate = extractDateFromTitle(rawTitle);
            const resolvedDate = extractedDate || pubDate || todayStr;
            return {
              videoId: item.id?.videoId || '',
              title: rawTitle,
              publishDate: resolvedDate,
              isTodayMatch: resolvedDate === todayStr || pubDate === todayStr,
            };
          });

        const todayItems = items.filter((i) => i.isTodayMatch);
        if (todayItems.length > 0) {
          console.log(`[youtubeFetcher] YouTube API found ${todayItems.length} MarketCall video(s) for ${todayStr}`);
          return todayItems;
        }

        console.log(`[youtubeFetcher] YouTube API today video not found for ${todayStr}. Returning empty.`);
        return [];
      }
    } catch (err) {
      console.warn('[youtubeFetcher] YouTube Data API search failed:', err.message);
    }
  }

  /* Strategy 2: Scrape BNN Bloomberg's YouTube channel page (zero-cost fallback) */
  try {
    timer?.start('YouTube channel page scrape');
    const res = await fetch(BNN_CHANNEL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    timer?.end('YouTube channel page scrape');

    if (!res.ok) return [];
    const html = await res.text();

    /* Extract all videoId strings from the channel page JSON payload */
    const videoIdMatches = html.match(/"videoId"\s*:\s*"([^"]{11})"/g) || [];
    const uniqueIds = [...new Set(videoIdMatches.map((m) => m.match(/"([^"]{11})"/)[1]))];

    if (uniqueIds.length === 0) return [];

    const dateFragments = buildDateFragments(todayStr);

    /* Inspect candidate videos in parallel for instant sub-second response */
    const inspectVideo = async (vid) => {
      try {
        const vRes = await fetch(`https://www.youtube.com/watch?v=${vid}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(5000),
        });
        if (!vRes.ok) return null;
        const vHtml = await vRes.text();

        const titleMatch = vHtml.match(/<title>([\s\S]*?)<\/title>/i);
        const rawTitle = titleMatch ? decodeHTMLTitle(titleMatch[1].trim()) : '';

        if (isMarketCallVideoTitle(rawTitle)) {
          const titleLower = rawTitle.toLowerCase();
          const isTodayMatch = dateFragments.some((frag) => titleLower.includes(frag));
          const extractedDate = extractDateFromTitle(rawTitle);
          const publishDate = extractedDate || (isTodayMatch ? todayStr : todayStr);

          return {
            videoId: vid,
            title: rawTitle.replace(/ - YouTube$/, ''),
            publishDate,
            isTodayMatch: isTodayMatch || extractedDate === todayStr,
          };
        }
      } catch (e) {
        console.error('inspectVideo error:', e.message);
        return null;
      }
      return null;
    };

    const inspected = await Promise.all(uniqueIds.slice(0, 50).map(inspectVideo));
    const results = inspected.filter(Boolean);

    /* Filter first for today's date matches */
    const todayResults = results.filter((r) => r.isTodayMatch);
    if (todayResults.length > 0) {
      console.log(`[youtubeFetcher] Channel scrape found ${todayResults.length} MarketCall video(s) for ${todayStr}`);
      return todayResults;
    }

    console.log(`[youtubeFetcher] Channel scrape: Today's video not published yet for ${todayStr}.`);
    return [];
  } catch (err) {
    console.warn('[youtubeFetcher] YouTube channel page scrape failed:', err.message);
  }

  return [];
}

/**
 * Fetch audio stream URL from external Python yt-dlp micro-worker.
 *
 * @param {string} videoId - YouTube video ID
 * @param {object} [timer] - Optional timing instrumentation
 * @returns {Promise<{streamUrl: string, audioFormat: string, duration: number} | null>}
 */
export async function fetchYoutubeAudio(videoId, timer) {
  const workerUrl = process.env.YT_DLP_WORKER_URL;
  const workerSecret = process.env.YT_DLP_WORKER_SECRET || '';

  if (!workerUrl) {
    console.warn('[youtubeFetcher] YT_DLP_WORKER_URL environment variable is not configured.');
    return { error: 'YT_DLP_WORKER_URL environment variable is missing in Vercel Dashboard. Please set YT_DLP_WORKER_URL under Vercel Settings -> Environment Variables to your Modal app URL.' };
  }

  try {
    timer?.start('yt-dlp micro-worker request');
    const headers = { 'Content-Type': 'application/json' };
    if (workerSecret) {
      headers['Authorization'] = `Bearer ${workerSecret}`;
    }

    const res = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ videoId }),
      signal: AbortSignal.timeout(30000),
    });
    timer?.end('yt-dlp micro-worker request');

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[youtubeFetcher] yt-dlp worker returned HTTP ${res.status}: ${errText}`);
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.detail || jsonErr.error || errText;
      } catch {}
      return { error: `Micro-worker HTTP ${res.status}: ${parsedErr}` };
    }

    const data = await res.json();
    const targetStreamUrl = data.streamUrl || data.stream_url;
    if ((data.status === 'success' || targetStreamUrl) && targetStreamUrl) {
      console.log(`[youtubeFetcher] yt-dlp worker returned audio stream (${data.audioFormat || 'm4a'}, ${data.duration || '?'}s)`);
      return {
        streamUrl: targetStreamUrl,
        audioFormat: data.audioFormat || 'm4a',
        duration: data.duration || 0,
      };
    }

    console.warn('[youtubeFetcher] yt-dlp worker returned unexpected response:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.warn('[youtubeFetcher] yt-dlp micro-worker request failed:', err.message);
    return null;
  }
}

/**
 * Full YouTube audio pipeline: discover video → extract audio via yt-dlp worker → return media object.
 *
 * Drop-in replacement for the deprecated fetchBnnWebPlayerMedia().
 *
 * @param {object} [timer] - Optional timing instrumentation
 * @returns {Promise<{streamUrl: string, videoTitle: string, episodeDate: string, source: string, videoId: string} | null>}
 */
export async function fetchYoutubeAudioMedia(timer) {
  const todayStr = getLatestMarketCallDateStr();
  const youtubeApiKey = process.env.CRON_YOUTUBE_KEY || '';

  timer?.start('YouTube audio pipeline');

  /* Step 1: Discover today's MarketCall video(s) */
  const videos = await discoverMarketCallVideos(todayStr, youtubeApiKey, timer);
  if (videos.length === 0) {
    console.warn(`[youtubeFetcher] No MarketCall videos found on YouTube for ${todayStr}`);
    timer?.end('YouTube audio pipeline');
    return null;
  }

  /* Step 2: Try each video until we get an audio stream from the yt-dlp worker */
  let lastError = null;
  for (const video of videos) {
    const audio = await fetchYoutubeAudio(video.videoId, timer);
    if (audio && audio.streamUrl) {
      timer?.end('YouTube audio pipeline');
      return {
        streamUrl: audio.streamUrl,
        videoTitle: video.title,
        episodeDate: video.publishDate || todayStr,
        source: 'youtube_ytdlp',
        videoId: video.videoId,
      };
    } else if (audio && audio.error) {
      lastError = audio.error;
    }
  }

  timer?.end('YouTube audio pipeline');
  return {
    error: lastError || 'YT_DLP_WORKER_URL environment variable is missing in Vercel Dashboard',
    videoTitle: videos[0]?.title || '',
    episodeDate: videos[0]?.publishDate || todayStr,
  };
}

/**
 * Transcribe YouTube audio stream via Groq Whisper AI (whisper-large-v3-turbo).
 *
 * Drop-in replacement for the deprecated transcribeBnnWebMedia().
 *
 * @param {string} streamUrl - Direct audio stream URL from yt-dlp worker
 * @param {string} groqKey - Groq API key (gsk_...)
 * @param {object} [timer] - Optional timing instrumentation
 * @returns {Promise<{text: string, error: string | null}>}
 */
export async function transcribeYoutubeAudio(streamUrl, groqKey, timer) {
  if (!groqKey || !groqKey.startsWith('gsk_')) {
    return { text: '', error: 'Missing or invalid Groq API key' };
  }

  try {
    timer?.start('YouTube audio stream download');
    const res = await fetch(streamUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      timer?.end('YouTube audio stream download');
      return { text: '', error: `Audio stream returned HTTP ${res.status}` };
    }

    const audioBuffer = await res.arrayBuffer();
    timer?.end('YouTube audio stream download');
    console.log(`[TIMING] YouTube audio stream downloaded: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

    /* Split audio buffer into 20MB slices to stay within Groq's 25MB payload limit */
    const CHUNK_LIMIT = 20 * 1024 * 1024;
    const chunks = [];
    let offset = 0;
    while (offset < audioBuffer.byteLength) {
      const end = Math.min(offset + CHUNK_LIMIT, audioBuffer.byteLength);
      chunks.push(audioBuffer.slice(offset, end));
      offset = end;
    }

    const transcribeChunk = async (chunkBuf, idx) => {
      const formData = new FormData();
      formData.append('file', new Blob([chunkBuf]), `yt_audio_part${idx}.m4a`);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'json');
      formData.append('prompt', 'Market Call BNN Bloomberg stock picks analyst recommendations valuation target price.');

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
        signal: AbortSignal.timeout(60000),
      });

      if (groqRes.ok) {
        const data = await groqRes.json().catch(() => null);
        return { text: data?.text || '', error: null };
      }
      const errData = await groqRes.json().catch(() => ({}));
      return { text: '', error: `Groq error (${groqRes.status}): ${errData.error?.message || groqRes.statusText}` };
    };

    timer?.start('Groq Whisper YouTube audio transcription');
    const results = await Promise.all(chunks.map((buf, i) => transcribeChunk(buf, i + 1)));
    timer?.end('Groq Whisper YouTube audio transcription');

    const fullText = results.map((r) => r.text).filter(Boolean).join(' ');

    if (fullText.trim().length >= 200) {
      return { text: fullText.trim(), error: null };
    }

    return { text: '', error: 'Groq Whisper returned an empty or too-short transcription for YouTube audio.' };
  } catch (err) {
    console.warn('[youtubeFetcher] YouTube audio transcription error:', err.message);
    return { text: '', error: `YouTube audio transcription exception: ${err.message}` };
  }
}

/* ── Internal Helpers ── */

/**
 * Checks if a video title is a BNN Bloomberg Market Call segment (Market Call, Market Outlook, Top Picks, Past Picks).
 */
export function isMarketCallVideoTitle(rawTitle) {
  if (!rawTitle) return false;
  const t = rawTitle.toLowerCase();
  return t.includes('market call') ||
         t.includes('marketcall') ||
         t.includes('market outlook') ||
         t.includes('market-outlook') ||
         t.includes('top picks') ||
         t.includes('past picks');
}

/**
 * Build date search fragments from YYYY-MM-DD for fuzzy title matching.
 * e.g. "2026-08-18" → ["august 18, 2026", "aug 18", "aug. 18", "08/18"]
 */
export function buildDateFragments(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const monthShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mi = parseInt(month, 10) - 1;
  const dayNum = parseInt(day, 10);

  return [
    `${monthNames[mi]} ${dayNum}, ${year}`,
    `${monthNames[mi]} ${dayNum} ${year}`,
    `${monthShort[mi]} ${dayNum}`,
    `${monthShort[mi]}. ${dayNum}`,
    `(${monthShort[mi]}. ${dayNum}`,
    `(${monthNames[mi]} ${dayNum}`,
  ];
}

/**
 * Decode common HTML entities in YouTube page titles.
 */
export function decodeHTMLTitle(str) {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'");
}

/**
 * Extract YYYY-MM-DD date string from video title (e.g., "Aug. 18, 2026" or "July 29, 2026" → "2026-08-18").
 */
export function extractDateFromTitle(title) {
  if (!title) return null;
  const monthMap = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08', sept: '09', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = title.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+([0-9]{1,2}),?\s+([0-9]{4})/i);
  if (match) {
    const mStr = match[1].toLowerCase();
    const month = monthMap[mStr] || '01';
    const day = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}
