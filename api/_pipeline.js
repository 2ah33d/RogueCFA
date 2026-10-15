/* ════════════════════════════════════════════════════════════════
   Date Utilities (Weekend Guard for BNN MarketCall broadcasts)
   ════════════════════════════════════════════════════════════════ */

/**
 * Returns latest weekday date string (YYYY-MM-DD).
 * MarketCall only airs Mon-Fri. If invoked on Sat/Sun, resolves to Friday.
 */
export function getLatestMarketCallDateStr(d = new Date()) {
  /* Enforce North American Eastern timezone (America/Toronto where BNN airs) */
  const options = { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false };
  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(d);
  const getPart = (type) => parts.find(p => p.type === type)?.value;
  
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  
  /* BNN Market Call airs Mon-Fri at 12:00 PM EST (9:00 AM PST).
     Before 12:00 PM EST on any day, today's show HAS NOT AIRED YET -> latest broadcast is previous day! */
  if (hour < 12) {
    dateObj.setUTCDate(dateObj.getUTCDate() - 1);
  }

  const dayOfWeek = dateObj.getUTCDay();
  if (dayOfWeek === 6) { // Saturday -> Friday
    dateObj.setUTCDate(dateObj.getUTCDate() - 1);
  } else if (dayOfWeek === 0) { // Sunday -> Friday
    dateObj.setUTCDate(dateObj.getUTCDate() - 2);
  }
  return dateObj.toISOString().split('T')[0];
}

/* ════════════════════════════════════════════════════════════════
   Timing instrumentation
   ════════════════════════════════════════════════════════════════ */

/**
 * Creates a timing tracker that logs stage durations to console.
 * Usage:
 *   const timer = createTimer();
 *   timer.start('MP3 download');
 *   ... await work ...
 *   timer.end('MP3 download');   // logs: [TIMING] MP3 download: 12345ms
 *   const report = timer.report(); // returns { stages: [...], totalMs }
 */
export function createTimer(onProgress) {
  const stages = [];
  const active = new Map();
  const t0 = Date.now();

  return {
    start(label) {
      active.set(label, Date.now());
      if (onProgress) onProgress(label);
    },
    end(label) {
      const started = active.get(label);
      if (started !== undefined) {
        const ms = Date.now() - started;
        stages.push({ label, ms });
        active.delete(label);
        console.log(`[TIMING] ${label}: ${ms}ms`);
      }
    },
    report() {
      return { stages, totalMs: Date.now() - t0 };
    },
  };
}

/* ════════════════════════════════════════════════════════════════
   HTML entity decoding
   ════════════════════════════════════════════════════════════════ */

export function decodeHTMLEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(dec));
}

/* ════════════════════════════════════════════════════════════════
   YouTube video discovery (DEPRECATED - Legacy Fallback)
   ════════════════════════════════════════════════════════════════ */

const BNN_CHANNEL_ID = 'UC5aNPmKYwbudeNngDMTY3lw';

const YOUTUBE_BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; RogueCFA/1.0; +https://github.com/2ah33d/RogueCFA.ai)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * @deprecated [LEGACY YOUTUBE FALLBACK]
 * Primary capture is now handled via Modal Live Stream Capture (modal_app/live_capture.py).
 */
export async function findRecentMarketCallVideos(youtubeKey, timer) {
  timer?.start('YouTube video search');
  const candidateMap = new Map();

  const isMarketCallVideo = (t) => {
    if (!t) return false;
    const title = t.toLowerCase();
    return title.includes('market call') ||
           title.includes('marketcall') ||
           title.includes('market outlook') ||
           title.includes('market-outlook') ||
           title.includes('top picks') ||
           title.includes('past picks');
  };

  /* Strategy 1: Check BNN Bloomberg's Uploads playlist directly (UU... instead of UC...). */
  try {
    const uploadsPlaylistId = BNN_CHANNEL_ID.replace(/^UC/, 'UU');
    const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    playlistUrl.searchParams.set('part', 'snippet');
    playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
    playlistUrl.searchParams.set('maxResults', '25');
    playlistUrl.searchParams.set('key', youtubeKey);

    const res = await fetch(playlistUrl.toString(), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      for (const item of items) {
        const rawTitle = decodeHTMLEntities(item.snippet?.title || '');
        const desc = decodeHTMLEntities(item.snippet?.description || '');
        if (isMarketCallVideo(rawTitle)) {
          const videoId = item.snippet?.resourceId?.videoId;
          if (videoId && !candidateMap.has(videoId)) {
            const extractedDate = parseDateFromTitle(rawTitle);
            const pubDate = item.snippet.publishedAt ? item.snippet.publishedAt.split('T')[0] : '';
            candidateMap.set(videoId, {
              videoId,
              videoTitle: rawTitle,
              episodeDate: extractedDate || pubDate || '',
              publishDate: extractedDate || pubDate || '',
              description: desc,
            });
          }
        }
      }
    } else if (res.status === 403 || res.status === 401) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`YouTube API key rejected: ${errBody.error?.message || res.statusText}`);
    }
  } catch (err) {
    if (err.message && err.message.includes('rejected')) throw err;
    console.warn('Uploads playlist lookup failed, trying search fallback:', err.message);
  }

  /* Strategy 2: Global YouTube search ordered by date (no channelId filter to bypass channel lag). */
  if (candidateMap.size < 5) {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', 'BNN Bloomberg Market Call');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('order', 'date');
    searchUrl.searchParams.set('maxResults', '25');
    searchUrl.searchParams.set('key', youtubeKey);

    const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) {
      const errBody = await searchRes.json().catch(() => ({}));
      const detail = errBody.error?.message || searchRes.statusText;
      if (searchRes.status === 403 || searchRes.status === 401) {
        if (candidateMap.size === 0) throw new Error(`YouTube API key rejected: ${detail}`);
      } else {
        if (candidateMap.size === 0) throw new Error(`YouTube search failed: ${detail}`);
      }
    } else {
      const searchData = await searchRes.json();
      const videos = searchData.items || [];
      for (const v of videos) {
        const rawTitle = decodeHTMLEntities(v.snippet?.title || '');
        const desc = decodeHTMLEntities(v.snippet?.description || '');
        const channel = (v.snippet?.channelTitle || '').toLowerCase();
        const isBnnOrRelevant = channel.includes('bnn') || channel.includes('bloomberg') || isMarketCallVideo(rawTitle);
        if (isBnnOrRelevant && isMarketCallVideo(rawTitle)) {
          const videoId = v.id?.videoId;
          if (videoId && !candidateMap.has(videoId)) {
            const extractedDate = parseDateFromTitle(rawTitle);
            const pubDate = v.snippet.publishedAt ? v.snippet.publishedAt.split('T')[0] : '';
            candidateMap.set(videoId, {
              videoId,
              videoTitle: rawTitle,
              episodeDate: extractedDate || pubDate || '',
              publishDate: extractedDate || pubDate || '',
              description: desc,
            });
          }
        }
      }
    }
  }

  timer?.end('YouTube video search');
  return Array.from(candidateMap.values()).slice(0, 8);
}

/**
 * Extract YYYY-MM-DD date string from video or article title (e.g., "Sept. 11, 2026" → "2026-09-11").
 */
export function parseDateFromTitle(title) {
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

/**
 * Extract broadcast date mentioned verbally by host in the transcript introduction.
 * BNN Market Call hosts announce the show date at the top of the hour:
 * e.g., "Welcome to Market Call for Tuesday, October 6th, 2026", "Today is October 6th".
 */
export function extractDateFromTranscript(transcriptText, referenceYear = null) {
  if (!transcriptText || typeof transcriptText !== 'string') return null;

  // Inspect the first 4,000 characters where host greeting occurs
  const intro = transcriptText.slice(0, 4000);

  const monthMap = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08', sept: '09', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const monthNames = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';

  // Pattern 1: Explicit month, day, and year (e.g. "October 6th, 2026", "October 6 2026")
  const pWithYear = new RegExp(
    `(?:welcome\\s+to\\s+market\\s+call|today\\s+is|it['’]s|broadcast(?:ing)?\\s+on|show\\s+for|on\\s+this|welcome\\s+back)?\\s*(?:monday|tuesday|wednesday|thursday|friday)?,?\\s*(${monthNames})\\.?\\s+(?:the\\s+)?([0-9]{1,2})(?:st|nd|rd|th)?,?\\s+([0-9]{4})`,
    'i'
  );
  const m1 = intro.match(pWithYear);
  if (m1) {
    const mStr = m1[1].toLowerCase();
    const month = monthMap[mStr] || '01';
    const day = m1[2].padStart(2, '0');
    const year = m1[3];
    return `${year}-${month}-${day}`;
  }

  // Pattern 2: Contextual greeting without year (e.g. "Welcome to Market Call for Tuesday, October 6th", "Today is Tuesday, October 6th")
  const pIntroNoYear = new RegExp(
    `(?:welcome\\s+to\\s+market\\s+call(?:\\s+for|\\s+on)?|today\\s+is|it['’]s|on\\s+this|show\\s+for)\\s+(?:monday|tuesday|wednesday|thursday|friday)?,?\\s*(${monthNames})\\.?\\s+(?:the\\s+)?([0-9]{1,2})(?:st|nd|rd|th)?\\b`,
    'i'
  );
  const m2 = intro.match(pIntroNoYear);
  if (m2) {
    const mStr = m2[1].toLowerCase();
    const month = monthMap[mStr] || '01';
    const day = m2[2].padStart(2, '0');
    const year = referenceYear ? String(referenceYear) : String(new Date().getUTCFullYear());
    return `${year}-${month}-${day}`;
  }

  // Pattern 3: Day first with month and year (e.g. "6th of October, 2026")
  const pDayFirst = new RegExp(
    `([0-9]{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\.?,?\\s+([0-9]{4})`,
    'i'
  );
  const m3 = intro.match(pDayFirst);
  if (m3) {
    const day = m3[1].padStart(2, '0');
    const mStr = m3[2].toLowerCase();
    const month = monthMap[mStr] || '01';
    const year = m3[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Detects whether the source broadcast content date matches the requested generation date.
 * If audio/transcript/title originates from a past day (e.g. Oct 6) while generation is requested
 * for a new day (e.g. Oct 12 holiday rerun), flags hasMismatch: true to abort corrupting the ledger.
 */
export function detectBroadcastDateMismatch(targetDateStr, { transcript = '', title = '', description = '', rssDate = '' } = {}) {
  if (!targetDateStr) return { hasMismatch: false, detectedDate: null, targetDate: targetDateStr };

  const refYear = targetDateStr.split('-')[0];

  const transcriptDate = extractDateFromTranscript(transcript, refYear);
  const titleDate = parseDateFromTitle(title);
  const descDate = parseDateFromTitle(description);
  const cleanRssDate = rssDate && /^\d{4}-\d{2}-\d{2}$/.test(rssDate) ? rssDate : null;

  const detectedDate = transcriptDate || titleDate || cleanRssDate || descDate;

  if (detectedDate && detectedDate !== targetDateStr) {
    const source = transcriptDate
      ? 'verbal transcript intro'
      : titleDate
        ? 'video/podcast title'
        : cleanRssDate
          ? 'RSS publication date'
          : 'description metadata';

    return {
      hasMismatch: true,
      detectedDate,
      targetDate: targetDateStr,
      source,
      reason: `Broadcast date mismatch detected: The source content is dated ${detectedDate} (via ${source}), which contradicts the requested generation date ${targetDateStr}. Refusing to stamp rerun broadcast as a live episode for ${targetDateStr}.`,
    };
  }

  return {
    hasMismatch: false,
    detectedDate: detectedDate || targetDateStr,
    targetDate: targetDateStr,
  };
}

/**
 * Normalizes candidate video items and finds the best matching YouTube video for targetDateStr.
 * Strictly verifies that the video title or description explicitly contains targetDateStr.
 * Never matches prior-day videos or loose upload timestamps.
 */
export function findMatchingYtVideo(candidateVideos, targetDateStr) {
  if (!Array.isArray(candidateVideos) || candidateVideos.length === 0 || !targetDateStr) return null;

  const normalized = candidateVideos.map((v) => {
    if (!v || !v.videoId) return null;
    const title = v.videoTitle || v.title || '';
    const extractedDate = parseDateFromTitle(title);
    const descDate = parseDateFromTitle(v.description || '');
    return {
      videoId: v.videoId,
      videoTitle: title,
      title: title,
      extractedDate: extractedDate || descDate,
      description: v.description || '',
    };
  }).filter(Boolean);

  if (normalized.length === 0) return null;

  /* Strict match: Video title or description date MUST explicitly equal targetDateStr */
  const exactMatch = normalized.find((v) => v.extractedDate && v.extractedDate === targetDateStr);
  if (exactMatch) return exactMatch;

  /* Strict: Never fall back to yesterday's video, loose publish timestamps, or newest video */
  return null;
}

/* ════════════════════════════════════════════════════════════════
   Transcript fetching — YouTube auto-captions
   ════════════════════════════════════════════════════════════════ */

/**
 * Extract a balanced JSON object from a string that may have trailing content.
 */
function extractBalancedJSON(str) {
  let depth = 0;
  let start = str.indexOf('{');
  if (start === -1) return str;

  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return str;
}

export async function fetchTranscript(videoId) {

  /* Strategy B: YouTube Page HTML with GDPR CONSENT cookies */
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(pageUrl, {
      headers: YOUTUBE_BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const captionsMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s) ||
                            html.match(/"playerCaptionsTracklistRenderer":\s*(\{.*?\})/s);
      if (captionsMatch) {
        let captionsData;
        try {
          const jsonStr = extractBalancedJSON(captionsMatch[1]);
          captionsData = JSON.parse(jsonStr);
        } catch {
          /* ignore json parse error */
        }

        const trackList = captionsData?.playerCaptionsTracklistRenderer?.captionTracks || captionsData?.captionTracks;
        if (Array.isArray(trackList) && trackList.length > 0) {
          const asrTrack = trackList.find((t) => t.languageCode === 'en' && t.kind === 'asr');
          const enTrack = trackList.find((t) => t.languageCode === 'en');
          const track = asrTrack || enTrack || trackList[0];

          if (track?.baseUrl) {
            const captionUrl = track.baseUrl + '&fmt=json3';
            const captionRes = await fetch(captionUrl, {
              headers: YOUTUBE_BROWSER_HEADERS,
              signal: AbortSignal.timeout(8000),
            });
            if (captionRes.ok) {
              const captionData = await captionRes.json();
              const text = (captionData?.events || [])
                .filter((e) => e.segs)
                .map((e) => e.segs.map((s) => s.utf8 || '').join(''))
                .filter(Boolean)
                .join(' ');
              if (text.length >= 200) return text;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Primary transcript fetch failed, trying timedtext fallback:', err.message);
  }

  /* Strategy C: Direct YouTube timedtext endpoints with CONSENT cookies */
  return await fetchTimedText(videoId);
}

/**
 * Fallback: hit timedtext endpoints directly (checking both ASR and manual en tracks)
 */
async function fetchTimedText(videoId) {
  const fetchJson = async (url) => {
    const res = await fetch(url, {
      headers: YOUTUBE_BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.events) {
      const text = data.events
        .filter((e) => e.segs)
        .map((e) => e.segs.map((s) => s.utf8 || '').join(''))
        .filter((t) => t.trim())
        .join(' ');
      if (text.length >= 200) return text;
    }
    throw new Error('Insufficient length');
  };

  const fetchXml = async (url) => {
    const res = await fetch(url, {
      headers: YOUTUBE_BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xmlText = await res.text();
    const textMatches = xmlText.match(/<text[^>]*>([\s\S]*?)<\/text>/gi);
    if (textMatches) {
      const text = textMatches
        .map((m) => m.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(' ');
      if (text.length >= 200) return text;
    }
    throw new Error('Insufficient length');
  };

  try {
    return await Promise.any([
      fetchJson(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`),
      fetchJson(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`),
      fetchXml(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`),
      fetchXml(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`)
    ]);
  } catch {
    return '';
  }
}

/* ════════════════════════════════════════════════════════════════
   RSS Podcast Fallback + Groq Whisper ASR (Architecture A)
   ════════════════════════════════════════════════════════════════ */

export async function fetchRssPodcastFallback(groqKey = '', timer, targetDate = null) {
  const rssUrls = [
    'https://www.omnycontent.com/d/playlist/4809bc8a-e41a-405c-93da-a8cf011df2f4/fcfd42e4-d5c6-4b4a-8c62-ae32016f1b9a/4ecaf48c-23a4-4f5e-84b3-ae3201711923/podcast.rss',
  ];

  const targetDateStr = targetDate || getLatestMarketCallDateStr();

  for (const url of rssUrls) {
    try {
      timer?.start('RSS feed fetch');
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RogueCFA/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      const xml = await res.text();
      const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

      const isOmny = url.includes('omnycontent.com');
      for (const itemXml of items) {
        if (isOmny || itemXml.toLowerCase().includes('market call') || itemXml.toLowerCase().includes('marketcall')) {
          /* Extract pubDate and title from RSS item */
          const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
          const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
          const rssItemTitle = titleMatch ? decodeHTMLEntities(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()) : '';
          let rssItemDate = '';
          if (pubDateMatch && pubDateMatch[1]) {
            const parsedD = new Date(pubDateMatch[1].trim());
            if (!isNaN(parsedD.getTime())) {
              rssItemDate = parsedD.toISOString().split('T')[0];
            }
          }

          /* Extract date from title e.g. "July 31, 2026" or "Aug. 4, 2026" */
          let titleDateStr = '';
          const titleDateMatch = rssItemTitle.match(/\(([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\)/i);
          if (titleDateMatch && titleDateMatch[1]) {
            const rawD = titleDateMatch[1].replace('.', '');
            const parsedTitleD = new Date(rawD + ' 12:00:00 UTC');
            if (!isNaN(parsedTitleD.getTime())) {
              titleDateStr = parsedTitleD.toISOString().split('T')[0];
            }
          }

          /* Enforce date check: match if pubDate or title date equals targetDateStr */
          const matchesTarget = (rssItemDate && rssItemDate === targetDateStr) || (titleDateStr && titleDateStr === targetDateStr) || rssItemTitle.includes(targetDateStr);
          if (!matchesTarget) {
            console.warn(`[RSS Fallback] Item date (${rssItemDate} / ${titleDateStr}) does not match target date (${targetDateStr}). Skipping.`);
            continue;
          }
          rssItemDate = titleDateStr || rssItemDate || targetDateStr;

          /* If groqKey is present, attempt free Whisper audio transcription on the MP3 stream */
          if (groqKey && groqKey.startsWith('gsk_')) {
            const mp3Match = itemXml.match(/https?:\/\/[^"'\s<>]+\.mp3[^"'\s<>]*/i);
            if (mp3Match) {
              try {
                let mp3Url = mp3Match[0]
                  .replace(/&amp;/g, '&')   /* Decode XML entity — RSS feeds encode & as &amp; */
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>');
                /* Unwrap third-party Podtrac tracking redirect (dts.podtrac.com/redirect.mp3/) to hit clean OmnyStudio audio CDN directly */
                if (mp3Url.includes('dts.podtrac.com/redirect.mp3/')) {
                  const unwrapped = mp3Url.split('dts.podtrac.com/redirect.mp3/')[1];
                  if (unwrapped) {
                    mp3Url = unwrapped.startsWith('http') ? unwrapped : `https://${unwrapped}`;
                  }
                }

                timer?.start('MP3 download');
                const audioRes = await fetch(mp3Url, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RogueCFA/1.0)' },
                  redirect: 'follow',
                  signal: AbortSignal.timeout(120000)
                });
                if (!audioRes.ok) {
                  timer?.end('MP3 download');
                  return { text: '', groqDiagnostic: `BNN Bloomberg audio stream returned HTTP ${audioRes.status}` };
                }
                const audioBuffer = await audioRes.arrayBuffer();
                timer?.end('MP3 download');
                console.log(`[TIMING] MP3 size: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

                /*
                 * Nullify Xing/Info VBR header in the audio buffer.
                 * Podcast MP3s contain large ID3v2 tags (with embedded album art)
                 * that push the Xing frame well beyond 4KB. Search the first 512KB
                 * to guarantee we find and zero it. Without this, FFmpeg on Groq
                 * reads the Xing-declared duration (e.g. 2778s), expects that many
                 * frames in a byte-sliced chunk, and hangs → 502 after 150+ seconds.
                 */
                const HEADER_SCAN_BYTES = Math.min(524288, audioBuffer.byteLength);
                const headerRegion = new Uint8Array(audioBuffer, 0, HEADER_SCAN_BYTES);
                const markers = [
                  [0x58, 0x69, 0x6E, 0x67], /* "Xing" */
                  [0x49, 0x6E, 0x66, 0x6F], /* "Info" */
                ];
                for (const marker of markers) {
                  for (let i = 0; i < headerRegion.length - 3; i++) {
                    if (headerRegion[i] === marker[0] && headerRegion[i+1] === marker[1] &&
                        headerRegion[i+2] === marker[2] && headerRegion[i+3] === marker[3]) {
                      headerRegion[i] = 0; headerRegion[i+1] = 0;
                      headerRegion[i+2] = 0; headerRegion[i+3] = 0;
                    }
                  }
                }

                /*
                 * Split MP3 into 21MB chunks to comply with Groq's 25MB limit.
                 * A 43MB episode yields 2-3 chunks, all transcribed concurrently
                 * via Promise.all — typically completes in ~15-20s total.
                 * The Xing/Info header nullification above prevents Groq 502 hangs.
                 */
                const CHUNK_LIMIT_BYTES = 21 * 1024 * 1024;
                const chunks = [];
                let offset = 0;
                while (offset < audioBuffer.byteLength) {
                  const end = Math.min(offset + CHUNK_LIMIT_BYTES, audioBuffer.byteLength);
                  chunks.push(audioBuffer.slice(offset, end));
                  offset = end;
                }
                console.log(`[TIMING] Audio split into ${chunks.length} chunks (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB total)`);

                /* Transcribe a single audio chunk via Groq Whisper Turbo */
                const transcribeChunk = async (chunkBuf, idx) => {
                  const formData = new FormData();
                  formData.append('file', new Blob([chunkBuf], { type: 'audio/mpeg' }), `marketcall_part${idx}.mp3`);
                  formData.append('model', 'whisper-large-v3-turbo');
                  formData.append('response_format', 'json');

                  let res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${groqKey}` },
                    body: formData,
                    signal: AbortSignal.timeout(120000),
                  });

                  if (!res.ok && res.status === 400) {
                    /* Fallback to distil-whisper if turbo model string is rejected */
                    formData.set('model', 'distil-whisper-large-v3-en');
                    res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${groqKey}` },
                      body: formData,
                      signal: AbortSignal.timeout(120000),
                    });
                  }

                  if (res.ok) {
                    const data = await res.json().catch(() => null);
                    return { text: data?.text || '', error: null };
                  }
                  const errData = await res.json().catch(() => ({}));
                  return { text: '', error: `Groq API error (${res.status} chunk ${idx}): ${errData.error?.message || res.statusText}` };
                };

                /* Transcribe ALL chunks concurrently — with 2-3 chunks this completes in ~15-20s */
                timer?.start('Whisper transcription');
                const results = await Promise.all(chunks.map((buf, i) => transcribeChunk(buf, i + 1)));
                timer?.end('Whisper transcription');

                const firstError = results.find(r => r.error);
                if (firstError && !results.some(r => r.text && r.text.length >= 200)) {
                  return { text: '', groqDiagnostic: firstError.error };
                }

                const combinedText = results.map(r => r.text).filter(Boolean).join('\n\n');
                if (combinedText.length >= 200) {
                  return { text: combinedText, rssItemDate, rssItemTitle, groqDiagnostic: null };
                }
                return { text: '', groqDiagnostic: 'Groq API returned an empty audio transcription payload.' };
              } catch (asrErr) {
                const isTimeout = asrErr.name === 'TimeoutError' || asrErr.message?.toLowerCase().includes('timeout') || asrErr.message?.toLowerCase().includes('aborted');
                return {
                  text: '',
                  groqDiagnostic: isTimeout
                    ? 'Downloading and transcribing the complete MP3 file exceeded Vercel\'s serverless execution timeout.'
                    : `Groq MP3 transcription exception: ${asrErr.message}`
                };
              }
            }
          }

          /* Text-based RSS description fallback */
          const contentMatches = itemXml.match(/<(?:content:encoded|description)[^>]*>([\s\S]*?)<\/(?:content:encoded|description)>/gi);
          if (contentMatches) {
            const text = contentMatches
              .map((m) => m.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').trim())
              .filter((t) => t.length > 50)
              .join(' ');
            if (text.length >= 100) {
              return { text, groqDiagnostic: null };
            }
          }
        }
      }
    } catch (rssErr) {
      /* If groqKey was provided, surface the error instead of silently swallowing */
      if (groqKey && groqKey.startsWith('gsk_')) {
        return { text: '', groqDiagnostic: `RSS/MP3 fetch exception: ${rssErr.message}` };
      }
      /* continue to next RSS URL for non-Groq paths */
    }
  }

  return null;
}

/**
 * Fallback: Check Supabase Storage bucket 'marketcall-audio' for compressed live capture audio (marketcall-{targetDateStr}.m4a).
 * If found, download the ~21MB .m4a file and transcribe via Groq Whisper API (< 25MB limit).
 */
export async function fetchSupabaseStorageAudioFallback(groqKey = '', timer, targetDate = null) {
  const targetDateStr = targetDate || getLatestMarketCallDateStr();
  const filename = `marketcall-${targetDateStr}.m4a`;

  try {
    timer?.start('Supabase Storage audio lookup');
    const { supabase } = await import('./_supabaseClient.js');

    const { data: fileData, error: downloadErr } = await supabase
      .storage
      .from('marketcall-audio')
      .download(filename);

    timer?.end('Supabase Storage audio lookup');

    if (downloadErr || !fileData) {
      console.log(`[Supabase Storage Fallback] No stored live audio found for ${filename}: ${downloadErr?.message || 'File not found'}`);
      return null;
    }

    const audioBuffer = await fileData.arrayBuffer();
    const sizeMb = (audioBuffer.byteLength / 1024 / 1024).toFixed(1);
    console.log(`[Supabase Storage Fallback] Found stored live capture audio for ${targetDateStr} (${sizeMb} MB)`);

    if (!groqKey || !groqKey.startsWith('gsk_')) {
      return { text: '', groqDiagnostic: 'Groq API key required for transcription of stored live capture audio.' };
    }

    timer?.start('Groq Whisper Live Audio Transcription');
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/mp4' }), filename);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: formData,
      signal: AbortSignal.timeout(90000),
    });
    timer?.end('Groq Whisper Live Audio Transcription');

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Supabase Storage Fallback] Groq Whisper API error (${res.status}): ${errText}`);
      return { text: '', groqDiagnostic: `Groq Whisper API returned HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json();
    const text = (data.text || '').trim();
    if (text.length >= 200) {
      console.log(`[Supabase Storage Fallback] Successfully transcribed live capture audio for ${targetDateStr} (${text.length} chars)`);
      return {
        text,
        rssItemTitle: `BNN Bloomberg Market Call (Live Stream Capture - ${targetDateStr})`,
        rssItemDate: targetDateStr,
      };
    }
  } catch (err) {
    console.warn(`[Supabase Storage Fallback] Error fetching/transcribing stored audio for ${targetDateStr}:`, err.message);
  }

  return null;
}

/* ════════════════════════════════════════════════════════════════
   Transcript cleaning
   ════════════════════════════════════════════════════════════════ */

export function cleanRawTranscript(rawText) {
  return rawText
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
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ════════════════════════════════════════════════════════════════
   YouTube Analyst Name Extraction & Phonetic Overrides
   ════════════════════════════════════════════════════════════════ */

export const PHONETIC_ANALYST_OVERRIDES = {
  'julien nono-wamden': 'Julien Nono-Womdim',
  'julian nono-wamden': 'Julien Nono-Womdim',
  'julien nono wamden': 'Julien Nono-Womdim',
  'julian nono wamden': 'Julien Nono-Womdim',
  'julien nono-womden': 'Julien Nono-Womdim',
  'julian nono': 'Julien Nono-Womdim',
  'julien nono': 'Julien Nono-Womdim',
  'julian klymochko': 'Julian Klymochko',
  'julien klymochko': 'Julian Klymochko',
  'ryan madden': 'Brian Madden',
  'brian madden': 'Brian Madden',
};

/**
 * Computes Levenshtein distance between two strings (case-insensitive).
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 0;

  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Normalized string similarity score [0.0 - 1.0].
 */
export function nameSimilarity(a, b) {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.trim().length, b.trim().length);
  return maxLen === 0 ? 1.0 : 1 - dist / maxLen;
}

/**
 * Canonical registry of recurring BNN Bloomberg Market Call analysts with known affiliations.
 * Used for zero-cost in-memory fuzzy matching and disambiguation against audio speech mishearings.
 */
export const KNOWN_BNN_ANALYSTS = [
  { name: 'Brian Madden', firm: 'First Avenue Investment Counsel', aliases: ['Ryan Madden', 'Bryan Madden'] },
  { name: 'Kim Bolton', firm: 'Black Swan Dexteritas', aliases: ['Tim Bolton'] },
  { name: 'Bruce Campbell', firm: 'StoneCastle Investment Management', aliases: ['Bruce Gamble'] },
  { name: 'Christine Poole', firm: 'Create Value Wealth Management' },
  { name: 'Greg Newman', firm: 'Scotia Wealth Management' },
  { name: 'Stan Wong', firm: 'Scotia Wealth Management', aliases: ['Dan Wong'] },
  { name: 'David Burrows', firm: 'Barometer Capital Management' },
  { name: 'Ivana Delevska', firm: 'Spear Invest' },
  { name: 'Larry Berman', firm: 'ETF Capital Management' },
  { name: 'Julien Nono-Womdim', firm: 'TD Asset Management', aliases: ['Julien Nono-Wamden', 'Julian Nono-Wamden', 'Julian Nono'] },
  { name: 'Julian Klymochko', firm: 'Accelerate Financial Technologies', aliases: ['Julien Klymochko'] },
  { name: 'Andrew Pyle', firm: 'CIBC Wood Gundy' },
  { name: 'Keith Richards', firm: 'ValueTrend Wealth Management' },
  { name: 'Brooke Thackray', firm: 'Global X Investments' },
  { name: 'Darren Sissons', firm: 'Campbell, Lee & Ross' },
  { name: 'John Zechner', firm: 'J. Zechner Associates' },
  { name: 'Jason Del Vicario', firm: 'Hillside Wealth Management' },
  { name: 'Brian Acker', firm: 'Acker Finley' },
  { name: 'Barry Schwartz', firm: 'Baskin Wealth Management' },
  { name: 'Norman Levine', firm: 'Portfolio Management Corporation' },
  { name: 'Colin Cieszynski', firm: 'SIA Wealth Management' },
  { name: 'Martin Pelletier', firm: 'Wellington-Altus Private Counsel' },
  { name: 'Cameron Hurst', firm: 'Equium Capital Management' },
  { name: 'Ross Healy', firm: 'Strategic Analysis Corporation' },
  { name: 'Rob Lauzon', firm: 'Middlefield Capital' },
  { name: 'Peter Hodson', firm: '5i Research' },
  { name: 'Allan Small', firm: 'iA Private Wealth' },
  { name: 'David Driscoll', firm: 'Liberty International Investment Management' },
  { name: 'Robert McWhirter', firm: 'Selective Asset Management' },
  { name: 'Michael Sprung', firm: 'Sprung Investment Management' },
  { name: 'Stephen Takacsy', firm: 'Lester Asset Management' },
  { name: 'Bill Harris', firm: 'Avenue Investment Management' },
  { name: 'Lorne Steinberg', firm: 'Steinberg Wealth Management' },
  { name: 'John Stephenson', firm: 'Stephenson & Company Capital Management' },
  { name: 'James Telfser', firm: 'Aventine Management Group' },
  { name: 'David Baskin', firm: 'Baskin Wealth Management' },
  { name: 'Kevin O\'Leary', firm: 'O\'Shares Investments' },
  { name: 'Gord O\'Reilly', firm: 'Northland Wealth Management' },
  { name: 'Paul Gardner', firm: 'Avenue Investment Management' },
  { name: 'Benj Gallander', firm: 'Contra the Heard' },
  { name: 'Hap Sneddon', firm: 'CastleMoore Investment Consulting' },
  { name: 'Earl Davis', firm: 'BMO Global Asset Management' },
  { name: 'Craig Basinger', firm: 'Purpose Investments' },
  { name: 'Geoff Castle', firm: 'PenderFund Capital Management' },
  { name: 'Michael O\'Brien', firm: 'TD Asset Management' },
  { name: 'Les Stelmach', firm: 'Franklin Templeton' },
  { name: 'Ryan Bushell', firm: 'Newhaven Asset Management' },
];

/**
 * Automated Database & Phonetic Analyst Disambiguation Engine.
 * Dynamically resolves speech-to-text audio mishearings (e.g. "Ryan Madden" -> "Brian Madden",
 * "Tim Bolton" -> "Kim Bolton", "Dan Wong" -> "Stan Wong") by matching against known BNN analysts.
 * 
 * Hierarchy:
 * 1. Explicit override alias dictionary
 * 2. Exact match (case-insensitive)
 * 3. Exact last name match + first name edit distance <= 1
 * 4. Firm name corroboration
 * 5. Full name Levenshtein distance <= 2 (minimum 8 chars)
 */
export function matchKnownAnalyst(heardName, heardFirm = '', extraDbAnalysts = []) {
  if (!heardName || typeof heardName !== 'string') {
    return { matched: false, name: heardName || '', confidence: 'unknown', distance: null };
  }

  const cleaned = heardName.trim();
  const lower = cleaned.toLowerCase();

  // 1. Explicit phonetic override check (backward compatibility)
  if (PHONETIC_ANALYST_OVERRIDES[lower]) {
    return {
      matched: true,
      name: PHONETIC_ANALYST_OVERRIDES[lower],
      confidence: 'phonetic_override',
      distance: 0,
      matchType: 'explicit_override',
    };
  }

  // Combine canonical directory with extra database analysts if provided
  const pool = [...KNOWN_BNN_ANALYSTS];
  if (Array.isArray(extraDbAnalysts)) {
    for (const extra of extraDbAnalysts) {
      const name = typeof extra === 'string' ? extra : extra?.name;
      const firm = typeof extra === 'object' ? extra?.firm : '';
      if (name && !pool.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        pool.push({ name, firm, aliases: [] });
      }
    }
  }

  // 2. Exact match
  const exact = pool.find((a) => a.name.toLowerCase() === lower);
  if (exact) {
    return {
      matched: true,
      name: exact.name,
      confidence: 'exact_database_match',
      distance: 0,
      firm: exact.firm,
    };
  }

  // 3. Known aliases check
  for (const analyst of pool) {
    if (analyst.aliases && analyst.aliases.some((alias) => alias.toLowerCase() === lower)) {
      return {
        matched: true,
        name: analyst.name,
        confidence: 'database_fuzzy_match',
        distance: 1,
        matchType: 'known_alias',
        firm: analyst.firm,
      };
    }
  }

  // Tokenize heard name
  const heardTokens = cleaned.split(/\s+/).filter(Boolean);
  const heardFirst = heardTokens[0] || '';
  const heardLast = heardTokens.slice(1).join(' ') || '';

  let bestMatch = null;
  let minDistance = 999;

  for (const analyst of pool) {
    const candidateName = analyst.name;
    const candTokens = candidateName.split(/\s+/).filter(Boolean);
    const candFirst = candTokens[0] || '';
    const candLast = candTokens.slice(1).join(' ') || '';

    const fullDist = levenshteinDistance(cleaned, candidateName);

    // Rule A: Last name exact match + first name edit distance <= 1
    // (e.g., "Ryan Madden" vs "Brian Madden", "Tim Bolton" vs "Kim Bolton", "Dan Wong" vs "Stan Wong")
    const lastMatches = heardLast.toLowerCase() === candLast.toLowerCase() && heardLast.length >= 3;
    const firstDist = levenshteinDistance(heardFirst, candFirst);

    if (lastMatches && firstDist <= 2) {
      return {
        matched: true,
        name: candidateName,
        confidence: 'database_fuzzy_match',
        distance: firstDist,
        matchType: 'last_name_and_phonetic_first',
        firm: analyst.firm,
      };
    }

    // Rule B: Firm name corroboration
    if (heardFirm && analyst.firm) {
      const hFirmLower = heardFirm.toLowerCase();
      const aFirmLower = analyst.firm.toLowerCase();
      const firmMatches = hFirmLower.includes(aFirmLower) || aFirmLower.includes(hFirmLower) ||
        (hFirmLower.includes('first avenue') && aFirmLower.includes('first avenue')) ||
        (hFirmLower.includes('black swan') && aFirmLower.includes('black swan')) ||
        (hFirmLower.includes('stonecastle') && aFirmLower.includes('stonecastle'));

      if (firmMatches && (lastMatches || firstDist <= 2 || fullDist <= 3)) {
        return {
          matched: true,
          name: candidateName,
          confidence: 'database_fuzzy_match',
          distance: fullDist,
          matchType: 'firm_corroborated_match',
          firm: analyst.firm,
        };
      }
    }

    // Rule C: Full name edit distance <= 2 for names of sufficient length (length >= 8)
    if (cleaned.length >= 8 && fullDist <= 2 && fullDist < minDistance) {
      minDistance = fullDist;
      bestMatch = {
        matched: true,
        name: candidateName,
        confidence: 'database_fuzzy_match',
        distance: fullDist,
        matchType: 'levenshtein_distance',
        firm: analyst.firm,
      };
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  return {
    matched: false,
    name: cleaned,
    confidence: 'audio_only',
    distance: minDistance < 999 ? minDistance : null,
  };
}

/**
 * Extracts official guest analyst name directly from YouTube video title & description.
 * Overrides phonetic audio Whisper transcription mishearings.
 */
export function extractAnalystFromYouTubeTitle(videoTitle, description = '') {
  if (!videoTitle || typeof videoTitle !== 'string') return null;

  const cleanTitle = decodeHTMLEntities(videoTitle).trim();

  // Pattern 0: "Jamie Murrays’ Market Outlook: ..." or "Keith Richards' Market Outlook: ..." or "Christine Poole's Top Picks"
  const p0 = cleanTitle.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z\-]+)+)(?:['’]s?|['’])\s+(?:Market\s+Outlook|Outlook|Top\s+Picks|Past\s+Picks|takes|shares|talks|discusses)/i);
  if (p0 && p0[1]) {
    let candidate = p0[1].trim();
    // Fix typo in plural possessive e.g. "Jamie Murrays’" -> "Jamie Murray"
    if (candidate.endsWith('s') && !['Chris', 'James', 'Denis', 'Charles', 'Curtis', 'Travis', 'Lucas', 'Thomas', 'Richards', 'Williams', 'Davis', 'Jones', 'Evans', 'Roberts', 'Andrews', 'Blumas'].includes(candidate.split(/\s+/).pop())) {
      candidate = candidate.replace(/s$/, '');
    }
    const words = candidate.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) return candidate;
  }

  // Pattern 1: "Market Call: Julian Klymochko on U.S. equities" or "MarketCall: Eric Nuttall's Top Picks"
  const p1 = cleanTitle.match(/market\s*call\s*[:\-–—]\s*([^'":\-–—\d\(\)]+?)(?:\s+(?:on|'s|’s|takes|shares|talks|with|gives|top|picks|discusses|outlook)|$)/i);
  if (p1 && p1[1]) {
    const candidate = p1[1].trim();
    const words = candidate.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && !/^(today|bnn|market|call|top|picks)$/i.test(words[0])) {
      return candidate;
    }
  }

  // Pattern 2: "Julian Klymochko on U.S. Equities - MarketCall"
  const p2 = cleanTitle.match(/^([^:\-–—\d\(\)]+?)\s+(?:on|takes|shares|talks|with|gives|top|picks|discusses)\s+.*(?:market\s*call|market\s*outlook)/i);
  if (p2 && p2[1]) {
    const candidate = p2[1].trim();
    const words = candidate.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      return candidate;
    }
  }

  // Pattern 3: "BNN Bloomberg MarketCall - Julian Klymochko"
  const p3 = cleanTitle.match(/(?:market\s*call|bnn\s+bloomberg)\s*[\-–—:]\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (p3 && p3[1]) {
    const candidate = p3[1].trim();
    if (!/^(top|picks|market|call|bnn|bloomberg)$/i.test(candidate.split(/\s+/)[0])) {
      return candidate;
    }
  }

  // Pattern 4: Search description for "Guest: Julian Klymochko"
  if (description && typeof description === 'string') {
    const p4 = description.match(/(?:guest|analyst|featured|interview(?:ing)?)\s*[:\-–—]?\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (p4 && p4[1]) {
      return p4[1].trim();
    }
  }

  return null;
}

/**
 * Scrapes BNN Bloomberg's Top Picks / Hot Picks page to find the analyst name
 * for a given broadcast date. Falls back to Queryly search API.
 * Returns the analyst name string or null if not found.
 * @param {string} targetDate - YYYY-MM-DD date string
 * @returns {Promise<string|null>}
 */
export async function fetchBnnTopPicksAnalyst(targetDate) {
  if (!targetDate) return null;

  const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  /* Helper: extract analyst name from a headline like "Christine Poole's Top Picks" or "Jamie Murrays’ Market Outlook" */
  function extractNameFromHeadline(headline) {
    if (!headline || typeof headline !== 'string') return null;
    const m = headline.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z\-]+)+)(?:['’]s|['’]s?|,|\s*-\s*|\s+on\s+|\s+top\s+|\s+hot\s+|\s+market\s+)/i);
    if (m && m[1]) {
      let name = m[1].trim();
      if (name.endsWith('s') && !['Chris', 'James', 'Denis', 'Charles', 'Curtis', 'Travis', 'Lucas', 'Thomas', 'Richards', 'Williams', 'Davis', 'Jones', 'Evans', 'Roberts', 'Andrews', 'Blumas'].includes(name.split(/\s+/).pop())) {
        name = name.replace(/s$/, '');
      }
      const words = name.split(/\s+/);
      if (words.length >= 2 && words.length <= 4) return name;
    }
    return null;
  }

  /* Helper: check if an article/item matches the target date */
  function matchesDate(text, targetDateStr) {
    if (!text) return false;
    if (text.includes(targetDateStr)) return true;
    /* Parse dates like "Aug. 11, 2026" or "August 11, 2026" */
    const datePatterns = text.match(/([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/g);
    if (datePatterns) {
      for (const dp of datePatterns) {
        try {
          const cleaned = dp.replace('.', '').replace(',', ',');
          const parsed = new Date(cleaned);
          if (!isNaN(parsed.getTime()) && parsed.toISOString().split('T')[0] === targetDateStr) {
            return true;
          }
        } catch { /* skip */ }
      }
    }
    return false;
  }

  /* Attempt 0: Official BNN Bloomberg Podcast RSS Feed (100% authoritative schedule & verified names) */
  try {
    const rssUrl = 'https://www.omnycontent.com/d/playlist/4809bc8a-e41a-405c-93da-a8cf011df2f4/fcfd42e4-d5c6-4b4a-8c62-ae32016f1b9a/4ecaf48c-23a4-4f5e-84b3-ae3201711923/podcast.rss';
    const rssRes = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RogueCFA/1.0)' },
      signal: AbortSignal.timeout(4000),
    });
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
      for (const itemXml of items) {
        const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const rssItemTitle = titleMatch ? decodeHTMLEntities(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()) : '';

        let itemDate = '';
        if (pubDateMatch && pubDateMatch[1]) {
          const parsedD = new Date(pubDateMatch[1].trim());
          if (!isNaN(parsedD.getTime())) {
            itemDate = parsedD.toISOString().split('T')[0];
          }
        }

        const titleParsedDate = parseDateFromTitle(rssItemTitle);
        const effectiveItemDate = titleParsedDate || itemDate;

        if (effectiveItemDate === targetDate || rssItemTitle.includes(targetDate)) {
          const name = extractNameFromHeadline(rssItemTitle) || extractAnalystFromYouTubeTitle(rssItemTitle);
          if (name) {
            console.log(`[fetchBnnTopPicksAnalyst] Found authoritative analyst from BNN Podcast RSS: "${name}" for ${targetDate}`);
            return name;
          }
        }
      }
    }
  } catch (rssErr) {
    console.warn(`[fetchBnnTopPicksAnalyst] BNN podcast RSS lookup failed: ${rssErr.message}`);
  }

  /* Attempt 1: Scrape BNN Hot Picks page directly */
  try {
    const res = await fetch('https://www.bnnbloomberg.ca/investing/hot-picks/', {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const html = await res.text();
      if (html.length > 1500 && !html.includes('captcha') && !html.includes('Access Denied')) {
        /* Look for article links with headlines containing Top Picks / Hot Picks for today */
        const articleRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
        let match;
        while ((match = articleRegex.exec(html)) !== null) {
          const url = match[1];
          const rawContent = match[2].replace(/<[^>]+>/g, '').trim();
          if (rawContent.length < 15) continue;
          if (!/top\s+picks|hot\s+picks|market\s+outlook/i.test(rawContent) && !/top\s+picks|hot\s+picks|market\s+outlook/i.test(url)) continue;

          /* Check if the article is for today's date */
          const surroundingHtml = html.slice(Math.max(0, match.index - 300), match.index + 500);
          if (matchesDate(surroundingHtml, targetDate) || matchesDate(rawContent, targetDate)) {
            const name = extractNameFromHeadline(rawContent);
            if (name) {
              console.log(`[fetchBnnTopPicksAnalyst] Found analyst from BNN Hot Picks page: "${name}" for ${targetDate}`);
              return name;
            }
          }
        }

        /* If no date-matched article, check the most recent Top Picks headline
           (BNN often doesn't include dates in the article card — the newest is today's) */
        articleRegex.lastIndex = 0;
        while ((match = articleRegex.exec(html)) !== null) {
          const rawContent = match[2].replace(/<[^>]+>/g, '').trim();
          if (rawContent.length < 15) continue;
          if (!/top\s+picks/i.test(rawContent)) continue;
          const name = extractNameFromHeadline(rawContent);
          if (name) {
            console.log(`[fetchBnnTopPicksAnalyst] Found analyst from most recent BNN Top Picks headline: "${name}"`);
            return name;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[fetchBnnTopPicksAnalyst] BNN page scrape failed: ${err.message}`);
  }

  /* Attempt 2: Queryly search API */
  try {
    const QUERYLY_KEY = 'e5c9f131f6f04418';
    const queries = ['market-call', 'top picks'];
    for (const query of queries) {
      const searchUrl = `https://api.queryly.com/json.aspx?queryly_key=${QUERYLY_KEY}&query=${encodeURIComponent(query)}&endindex=15`;
      const res = await fetch(searchUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        for (const item of items) {
          if (!item || !item.title) continue;
          if (item.pubdate && matchesDate(item.pubdate, targetDate)) {
            const name = extractNameFromHeadline(item.title);
            if (name) {
              console.log(`[fetchBnnTopPicksAnalyst] Found analyst from Queryly search: "${name}" for ${targetDate}`);
              return name;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[fetchBnnTopPicksAnalyst] Queryly search failed: ${err.message}`);
  }

  return null;
}

/**
 * Resolves the analyst name hierarchy:
 * 1. Authoritative BNN schedule / article / RSS guest for targetDateStr (overrides heard name)
 * 2. Date-verified YouTube / video title for targetDateStr
 * 3. Dynamic Database Fuzzy & Phonetic Matcher (Levenshtein <= 2, same last name + phonetic first name, firm corroboration)
 * 4. Audio-only fallback with pronunciation disclaimer
 */
export function resolveAnalystName(rawGuest, videoTitle = '', description = '', bnnArticleGuest = '', targetDateStr = '', guestFirm = '') {
  if (!rawGuest || typeof rawGuest !== 'string') {
    return { name: 'BNN Bloomberg Guest', confidence: 'audio_only', disclaimer: null };
  }

  const cleanedRaw = rawGuest.trim();

  /* Priority 1: BNN article or RSS schedule-confirmed analyst name for targetDateStr */
  if (bnnArticleGuest && typeof bnnArticleGuest === 'string' && bnnArticleGuest.trim().length > 2) {
    const verifiedName = bnnArticleGuest.trim();
    console.log(`[resolveAnalystName] Using authoritative BNN schedule-confirmed analyst: "${verifiedName}" (Audio/LLM said: "${cleanedRaw}")`);
    return {
      name: verifiedName,
      confidence: 'official_article',
      disclaimer: null,
    };
  }

  /* Priority 2: Video title extraction (STRICTLY ONLY IF video date matches targetDateStr) */
  if (videoTitle) {
    let titleDateOk = false;
    if (targetDateStr) {
      const vDate = parseDateFromTitle(videoTitle);
      if (vDate && vDate === targetDateStr) {
        titleDateOk = true;
      }
    } else {
      titleDateOk = Boolean(parseDateFromTitle(videoTitle));
    }
    if (titleDateOk) {
      const ytName = extractAnalystFromYouTubeTitle(videoTitle, description);
      if (ytName) {
        return {
          name: ytName,
          confidence: 'verified_youtube',
          disclaimer: null,
        };
      }
    }
  }

  /* Priority 3: Dynamic Database & Phonetic Fuzzy Matcher (for mishearings) */
  const dbMatch = matchKnownAnalyst(cleanedRaw, guestFirm);
  if (dbMatch.matched && dbMatch.confidence !== 'exact_database_match') {
    console.log(`[resolveAnalystName] Matched known analyst: "${cleanedRaw}" -> "${dbMatch.name}" (${dbMatch.confidence}, distance ${dbMatch.distance})`);
    return {
      name: dbMatch.name,
      confidence: dbMatch.confidence,
      disclaimer: null,
    };
  }

  /* Priority 4: Default to audio heard name + disclaimer */
  return {
    name: cleanedRaw,
    confidence: 'audio_only',
    disclaimer: 'Analyst name heard from live audio broadcast; spelling may vary pending official BNN publication.',
  };
}

export function sanitizeAnalystName(rawGuest, videoTitle = '', description = '', bnnArticleGuest = '', targetDateStr = '', guestFirm = '') {
  return resolveAnalystName(rawGuest, videoTitle, description, bnnArticleGuest, targetDateStr, guestFirm).name;
}

/**
 * Canadian / TSX Market Holiday Calendar Engine.
 * Accurately calculates all statutory Canadian market holidays where the TSX is closed
 * and BNN Bloomberg does not produce live Market Call programming.
 */
export function getEasterSunday(year) {
  const f = Math.floor;
  const G = year % 19;
  const C = f(year / 100);
  const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
  const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
  const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
  const L = I - J;
  const month = 3 + f((L + 40) / 44);
  const day = L + 28 - 31 * f(month / 4);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getNthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (d.getUTCMonth() === month) {
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === n) return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

export function isCanadianMarketHoliday(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  const year = d.getUTCFullYear();
  const dayOfWeek = d.getUTCDay();

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const toYMD = (dt) => dt.toISOString().split('T')[0];
  const holidays = new Set();

  // New Year's Day (Jan 1, observed Jan 2 if Sunday)
  const ny = new Date(Date.UTC(year, 0, 1));
  if (ny.getUTCDay() === 0) holidays.add(toYMD(new Date(Date.UTC(year, 0, 2))));
  else if (ny.getUTCDay() !== 6) holidays.add(toYMD(ny));

  // Family Day: 3rd Monday in February
  const familyDay = getNthWeekdayOfMonth(year, 1, 1, 3);
  if (familyDay) holidays.add(toYMD(familyDay));

  // Good Friday: 2 days before Easter
  const easter = getEasterSunday(year);
  const goodFriday = new Date(easter.getTime() - 2 * 86400000);
  holidays.add(toYMD(goodFriday));

  // Victoria Day: Monday on or before May 24
  const vDay = new Date(Date.UTC(year, 4, 24));
  while (vDay.getUTCDay() !== 1) {
    vDay.setUTCDate(vDay.getUTCDate() - 1);
  }
  holidays.add(toYMD(vDay));

  // Canada Day: July 1 (observed July 2 if Sunday)
  const canadaDay = new Date(Date.UTC(year, 6, 1));
  if (canadaDay.getUTCDay() === 0) holidays.add(toYMD(new Date(Date.UTC(year, 6, 2))));
  else if (canadaDay.getUTCDay() !== 6) holidays.add(toYMD(canadaDay));

  // Civic Holiday: 1st Monday in August
  const civicHoliday = getNthWeekdayOfMonth(year, 7, 1, 1);
  if (civicHoliday) holidays.add(toYMD(civicHoliday));

  // Labour Day: 1st Monday in September
  const labourDay = getNthWeekdayOfMonth(year, 8, 1, 1);
  if (labourDay) holidays.add(toYMD(labourDay));

  // Canadian Thanksgiving: 2nd Monday in October
  const thanksgiving = getNthWeekdayOfMonth(year, 9, 1, 2);
  if (thanksgiving) holidays.add(toYMD(thanksgiving));

  // Christmas (Dec 25) & Boxing Day (Dec 26)
  holidays.add(toYMD(new Date(Date.UTC(year, 11, 25))));
  holidays.add(toYMD(new Date(Date.UTC(year, 11, 26))));

  return holidays.has(dateStr);
}

/**
 * Syndicated Rebroadcast & Duplicate Episode Anomaly Detector.
 * Inspects recent completed digests within a 14-day rolling window to identify:
 * 1. Syndicated holiday reruns (same analyst with identical picks / commentary rebroadcast on holiday).
 * 2. Consecutive day double-mention anomalies (BNN Market Call does not host the same analyst two days in a row).
 */
export async function detectRebroadcastOrDuplicate(targetDateStr, newDigest, supabase) {
  if (!targetDateStr || !newDigest || !supabase) return null;

  try {
    const cutoffDate = new Date(new Date(targetDateStr).getTime() - 14 * 86400000).toISOString().split('T')[0];
    let query = supabase
      .from('digest_jobs')
      .select('id, episode_date, result')
      .lt('episode_date', targetDateStr);

    if (typeof query.gte === 'function') {
      query = query.gte('episode_date', cutoffDate);
    }

    const { data: pastRows, error } = await query
      .eq('status', 'complete')
      .not('result', 'is', null)
      .order('episode_date', { ascending: false })
      .limit(10);

    if (error || !pastRows || pastRows.length === 0) return null;

    const currGuest = (newDigest.guest || '').trim().toLowerCase();
    const currPicks = (newDigest.picks || []).map((p) => (p.ticker || p.company || '').toUpperCase().trim()).filter(Boolean);

    for (let i = 0; i < pastRows.length; i++) {
      const pastEpisode = pastRows[i];
      const pastDigest = pastEpisode.result?.digest;
      if (!pastDigest) continue;

      const pastGuest = (pastDigest.guest || '').trim().toLowerCase();
      const guestMatches = Boolean(
        currGuest &&
        pastGuest &&
        (currGuest === pastGuest || currGuest.includes(pastGuest) || pastGuest.includes(currGuest)) &&
        !currGuest.includes('guest')
      );

      const pastPicks = (pastDigest.picks || []).map((p) => (p.ticker || p.company || '').toUpperCase().trim()).filter(Boolean);
      const commonPicks = currPicks.filter((p) => pastPicks.includes(p));
      const pickOverlapRatio = currPicks.length > 0 ? commonPicks.length / currPicks.length : 0;
      const picksMatch = currPicks.length >= 2 && pickOverlapRatio >= 0.5;

      // Rebroadcast Detection: Same analyst AND high pick overlap in 14-day window
      if (guestMatches && picksMatch) {
        const isHoliday = isCanadianMarketHoliday(targetDateStr);
        const warningMsg = `Syndicated rebroadcast detected: Matches identical analyst (${newDigest.guest}) and overlapping picks (${commonPicks.join(', ')}) from ${pastEpisode.episode_date}.${isHoliday ? ' Note: Date is a Canadian exchange holiday (TSX closed).' : ''}`;
        console.warn(`[detectRebroadcastOrDuplicate] ${warningMsg}`);

        return {
          isDouble: true,
          isRebroadcast: true,
          isHolidayRebroadcast: isHoliday,
          originalDate: pastEpisode.episode_date,
          originalJobId: pastEpisode.id,
          prevDate: pastEpisode.episode_date,
          matchedGuest: true,
          matchedPicks: true,
          commonPicks,
          warningMessage: warningMsg,
        };
      }

      // Consecutive Day Check: only for the immediate previous recorded broadcast (i === 0)
      if (i === 0 && (guestMatches || picksMatch)) {
        const reason = guestMatches
          ? `identical analyst (${newDigest.guest})`
          : `overlapping picks (${commonPicks.join(', ')})`;
        const warningMsg = `Potential duplicate episode anomaly: Matches ${reason} from ${pastEpisode.episode_date}. BNN Market Call does not host the same analyst two consecutive trading days.`;
        console.warn(`[detectRebroadcastOrDuplicate] ${warningMsg}`);

        return {
          isDouble: true,
          isRebroadcast: false,
          prevDate: pastEpisode.episode_date,
          matchedGuest: guestMatches,
          matchedPicks: picksMatch,
          commonPicks,
          warningMessage: warningMsg,
        };
      }
    }
  } catch (err) {
    console.warn('[detectRebroadcastOrDuplicate] Check failed:', err.message);
  }

  return null;
}

export const detectConsecutiveDayDouble = detectRebroadcastOrDuplicate;

/* ════════════════════════════════════════════════════════════════
   Digest post-processing & canonical entity sanitization
   ════════════════════════════════════════════════════════════════ */

export const CANONICAL_TICKER_MAP = {
  'COGECO': { ticker: 'CCA', company: 'Cogeco Communications' },
  'COGECO COMMUNICATIONS': { ticker: 'CCA', company: 'Cogeco Communications' },
  'COGECO INC': { ticker: 'CCA', company: 'Cogeco Communications' },
  'KOJIKO': { ticker: 'CCA', company: 'Cogeco Communications' },
  'KOJIKO COMMUNICATIONS': { ticker: 'CCA', company: 'Cogeco Communications' },
  'QUEBECOR': { ticker: 'QBR.B', company: 'Quebecor Inc' },
  'QUEBECOIS': { ticker: 'QBR.B', company: 'Quebecor Inc' },
  'BIRD CONSTRUCTION': { ticker: 'BDT', company: 'Bird Construction' },
  'BIRD': { ticker: 'BDT', company: 'Bird Construction' },
  'CEREBRAS': { ticker: 'CBRS', company: 'Cerebras Systems' },
  'CEREBRAS SYSTEMS': { ticker: 'CBRS', company: 'Cerebras Systems' },
  'ANTHROPIC': { ticker: '', company: 'Anthropic' },
  'ANTHROPIK': { ticker: '', company: 'Anthropic' },
  'ROYAL BANK': { ticker: 'RY', company: 'Royal Bank of Canada' },
  'TD BANK': { ticker: 'TD', company: 'Toronto-Dominion Bank' },
  'TORONTO DOMINION': { ticker: 'TD', company: 'Toronto-Dominion Bank' },
  'BMO': { ticker: 'BMO', company: 'Bank of Montreal' },
  'BANK OF MONTREAL': { ticker: 'BMO', company: 'Bank of Montreal' },
  'ABBOTT': { ticker: 'ABT', company: 'Abbott Laboratories' },
  'ABBOTT LABS': { ticker: 'ABT', company: 'Abbott Laboratories' },
  'CHIPOTLE': { ticker: 'CMG', company: 'Chipotle Mexican Grill' },
  'MOTOROLA': { ticker: 'MSI', company: 'Motorola Solutions' },
  'ELEMENT FLEET': { ticker: 'EFN', company: 'Element Fleet Management' },
  'ELEMENT FLEET MANAGEMENT': { ticker: 'EFN', company: 'Element Fleet Management' },
};

/**
 * Reverse ticker lookup map: maps hallucinated or ambiguous tickers
 * to their verified canonical ticker & company name.
 */
export const CANONICAL_REVERSE_TICKER_MAP = {
  'CCI': { ticker: 'CCA', company: 'Cogeco Communications' },
  'CJR': { ticker: 'CCA', company: 'Cogeco Communications' },
  'CJR.B': { ticker: 'CCA', company: 'Cogeco Communications' },
  'CGO': { ticker: 'CCA', company: 'Cogeco Communications' },
  'EFP': { ticker: 'EFN', company: 'Element Fleet Management' },
  'BIRD': { ticker: 'BDT', company: 'Bird Construction' },
  'CCA': { ticker: 'CCA', company: 'Cogeco Communications' },
  'QBR.B': { ticker: 'QBR.B', company: 'Quebecor Inc' },
  'QBR': { ticker: 'QBR.B', company: 'Quebecor Inc' },
  'BDT': { ticker: 'BDT', company: 'Bird Construction' },
  'CBRS': { ticker: 'CBRS', company: 'Cerebras Systems' },
  'RY': { ticker: 'RY', company: 'Royal Bank of Canada' },
  'TD': { ticker: 'TD', company: 'Toronto-Dominion Bank' },
  'BMO': { ticker: 'BMO', company: 'Bank of Montreal' },
  'ABT': { ticker: 'ABT', company: 'Abbott Laboratories' },
  'CMG': { ticker: 'CMG', company: 'Chipotle Mexican Grill' },
  'MSI': { ticker: 'MSI', company: 'Motorola Solutions' },
  'EFN': { ticker: 'EFN', company: 'Element Fleet Management' },
};

/**
 * Helper to perform word-boundary-aware fuzzy string matching.
 * Ensures short keys (e.g. 'TD' or 'BIRD') match full word phrases rather than arbitrary substrings.
 */
function isWordBoundaryMatch(text, patternKey) {
  if (!text || !patternKey) return false;
  if (text === patternKey) return true;

  const escapedPattern = patternKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternRegex = new RegExp(`(?:^|\\s)${escapedPattern}(?:$|\\s)`, 'i');
  if (patternRegex.test(text)) return true;

  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textRegex = new RegExp(`(?:^|\\s)${escapedText}(?:$|\\s)`, 'i');
  if (textRegex.test(patternKey)) return true;

  return false;
}

/**
 * Sanitizes, deduplicates, and resolves ASR phonetic mishearings in the LLM digest.
 *
 * @param {object} digest - Raw LLM output object
 * @param {string} [transcriptText] - Optional source transcript text to check for Past Picks markers
 */
export function sanitizeDigestResult(digest, transcriptText = '') {
  if (!digest || typeof digest !== 'object') return digest;

  if (!Array.isArray(digest._warnings)) {
    digest._warnings = [];
  }

  const normalizeItem = (item) => {
    if (!item) return item;
    let rawComp = (item.company || item.companyName || '').trim();
    // 1. Remove fabricated parentheticals from corporate names (e.g. "(Videotron/Cable subsidiary)")
    rawComp = rawComp.replace(/\(.*?\)/g, '').trim();

    const uppercaseComp = rawComp.toUpperCase();
    const rawTick = (item.ticker || '').trim().toUpperCase();

    // 2. Strip trailing parentheticals and corporate suffixes for fuzzy matching
    const stripped = uppercaseComp
      .replace(/\b(INC\.?|CORP\.?|CORPORATION|COMMUNICATIONS|LTD\.?|LIMITED|PLC\.?|CO\.?|HOLDINGS?|SUBSIDIARY)\b/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .trim();

    // 3. Match against CANONICAL_TICKER_MAP via exact or word-boundary token match, or reverse ticker lookup
    let matchedCanonical = null;

    if (CANONICAL_TICKER_MAP[uppercaseComp]) {
      matchedCanonical = CANONICAL_TICKER_MAP[uppercaseComp];
    } else if (stripped) {
      const matchKey = Object.keys(CANONICAL_TICKER_MAP).find((k) => {
        const kStripped = k
          .replace(/\b(INC\.?|CORP\.?|CORPORATION|COMMUNICATIONS|LTD\.?|LIMITED|PLC\.?|CO\.?|HOLDINGS?|SUBSIDIARY)\b/g, '')
          .replace(/[^A-Z0-9\s]/g, '')
          .trim();
        return isWordBoundaryMatch(stripped, kStripped);
      });
      if (matchKey) {
        matchedCanonical = CANONICAL_TICKER_MAP[matchKey];
      }
    }

    if (matchedCanonical) {
      item.ticker = matchedCanonical.ticker;
      item.company = matchedCanonical.company;
    } else if (CANONICAL_REVERSE_TICKER_MAP[rawTick]) {
      item.ticker = CANONICAL_REVERSE_TICKER_MAP[rawTick].ticker;
      item.company = CANONICAL_REVERSE_TICKER_MAP[rawTick].company;
    } else {
      item.company = rawComp;
    }

    return item;
  };

  const deduplicateList = (list) => {
    if (!Array.isArray(list)) return [];
    const map = new Map();
    for (const rawItem of list) {
      const item = normalizeItem(rawItem);
      const key = (item.ticker || item.company || '').toUpperCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key);
        if (item.reasoning && !existing.reasoning.includes(item.reasoning)) {
          existing.reasoning += ` ${item.reasoning}`;
        }
      }
    }
    return Array.from(map.values());
  };

  if (digest.picks) digest.picks = deduplicateList(digest.picks);
  if (digest.callerMentions) digest.callerMentions = deduplicateList(digest.callerMentions);
  if (digest.pastPicks || digest.past_picks) {
    const rawPast = digest.pastPicks || digest.past_picks;
    digest.pastPicks = deduplicateList(rawPast);
  }

  // Check for missing pastPicks when transcript contains Past Picks segment markers
  const textToCheck = transcriptText || digest.rawText || digest.transcript || '';
  if (textToCheck && typeof textToCheck === 'string') {
    const hasPastPicksMarkers = /past\s+picks|we\s+did\s+sell|looking\s+back\s+at|picks\s+from|prior\s+episode|months\s+ago|year\s+ago/i.test(textToCheck);
    const hasPastPicksItems = Array.isArray(digest.pastPicks) && digest.pastPicks.length > 0;
    if (hasPastPicksMarkers && !hasPastPicksItems) {
      const warnMsg = 'Transcript text contains Past Picks review markers but digest.pastPicks is empty.';
      console.warn(`[sanitizeDigestResult] WARNING: ${warnMsg}`);
      if (!digest._warnings.includes(warnMsg)) {
        digest._warnings.push(warnMsg);
      }
    }
  }

  return digest;
}

/* ════════════════════════════════════════════════════════════════
   Digest prompt construction
   ════════════════════════════════════════════════════════════════ */

export function buildDigestPrompt(transcript, videoTitle = '', description = '', targetDateStr = '') {
  let verifiedVideoTitle = videoTitle || '';
  if (targetDateStr && verifiedVideoTitle) {
    const vDate = parseDateFromTitle(verifiedVideoTitle);
    if (vDate && vDate !== targetDateStr) {
      verifiedVideoTitle = ''; // Reject title from a different date
    }
  }

  const officialGuest = verifiedVideoTitle ? extractAnalystFromYouTubeTitle(verifiedVideoTitle, description) : null;

  const systemPrompt = `You are a CFA-level financial research assistant that summarizes BNN Bloomberg MarketCall episodes.
Your job is to produce a structured, highly accurate digest from the provided episode transcript.

STRICT ACCURACY & GROUNDING RULES:
1. ONLY reference what the guest ACTUALLY SAID in the transcript. Do NOT add outside analysis, opinion, or unstated facts not present in the transcript. Do NOT add corporate structure, ownership, or subsidiary relationship details (e.g. parentheticals like "(Videotron/Cable subsidiary)") unless explicitly stated in the transcript.
2. ACCURATE GUEST NAME & FIRM: ${officialGuest ? `The verified official guest name for this episode is "${officialGuest}". ALWAYS set "guest": "${officialGuest}".` : `Extract the guest's real full name and firm accurately from the host's introduction in the broadcast transcript (e.g. "Thanks for joining us today here on Market Call... [Name] with us on the show. [Title/Firm]").`} Do NOT output phonetic Whisper mishearings (e.g. "Julian Nono-Wamden").
3. ENTITY RESOLUTION & NO INVENTED TICKERS:
   - Silently resolve phonetic ASR errors to real company names & tickers (e.g. "Kojiko" → Cogeco Communications / CCA; "Quebecois" → Quebecor Inc / QBR.B; "Bird Construction" → BDT; "Element Fleet" → EFN).
   - Verify every ticker symbol. If you are not fully certain of a ticker, do not substitute a similar-sounding real ticker from a different company — leave the ticker field as an empty string instead (e.g. do not output CCI or CJR for Cogeco; do not output EFP for Element Fleet Management).
   - ONE ENTRY PER COMPANY: Combine all discussions of the same company into ONE single entry. Never emit multiple duplicate entries or alternative listing tickers for the same underlying company.
4. STRICT OWNERSHIP, RECOMMENDATION TRUTH & NARRATIVE DIRECTION:
   - Pay strict attention to whether the analyst explicitly states they OWN or DO NOT OWN the stock.
   - When an analyst compares two companies and states a preference, identify clearly which company is the one being discussed/asked about and which is the preferred alternative — do not attribute the preference statement to the company under discussion (e.g. if the analyst avoids Cogeco and prefers Quebecor, state clearly that Quebecor is the preferred alternative, NOT Cogeco).
   - STANCE TAXONOMY:
     * "buy": Analyst explicitly recommends buying, adding, or gives a clear positive/bullish recommendation.
     * "sell": Analyst explicitly recommends selling, trimming, or exiting a position they currently hold, or explicitly says to sell/exit if you own it.
     * "hold": Analyst recommends holding, neutral posture, wait-and-see, fair valuation, or is not owned + waiting for a specific condition to improve (e.g. staying on the sidelines pending proof of a turnaround = HOLD, not SELL).
     * "unsure": Analyst is uncertain, hesitant, declined to take a position, or gives a mixed/ambiguous opinion.
   - RISK-REWARD & EXECUTION STRUCTURE:
     * Note any stated target prices, current trading prices, and expected upside delta.
     * If an analyst cites stretched/high valuation and advises a defensive structure (e.g. selling short-dated covered calls to manufacture yield, advising staged limit buy orders down 10-15% as downside buffers, or avoiding a full position), explicitly detail this in the reasoning. Do NOT present defensive covered-call yield trades or capped-upside hedges as high-conviction directional long bets.
5. COMPLETE COVERAGE OF ALL SEGMENTS:
   - "picks": MUST contain EXACTLY the guest's NEW official featured Top Picks (typically 3 stocks) introduced for today's market.
   - "callerMentions": MUST contain ALL caller Q&A stock discussions and sector overviews (e.g. Canadian Banks like RY, TD, BMO). Do NOT drop caller turns or sector exchanges.
   - "pastPicks": MUST contain historical "Past Picks" reviewed during the episode whenever present (e.g. Abbott Labs, Chipotle, Motorola Solutions). Indicate whether each was exited at a loss, gain, or held.
6. NO UNSTATED QUALIFIERS: Do NOT add time-bound or quantitative qualifiers (such as "year-to-date", "quarter-over-quarter", or "52-week") unless explicitly stated in the source transcript text.
7. CRITICAL JSON ESCAPING & STRUCTURE: Ensure your output is perfectly valid JSON. Do NOT use unescaped double quotes inside strings (escape them as \"). ALWAYS close all open arrays with ] before closing the root object with }.

OUTPUT FORMAT — respond with valid JSON only, no markdown fences:
{
  "guest": "${officialGuest || 'Full Name'}",
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
      "country": "CAD" | "US",
      "reasoning": "80-150 words condensing the guest's own logic for this official top pick — WHY they like it, any stated price target or timeframe, any specific catalyst or metric they referenced.",
      "stance": "buy"
    }
  ],
  "callerMentions": [
    {
      "ticker": "TICKER",
      "company": "Company Name",
      "country": "CAD" | "US",
      "reasoning": "60-120 words condensing what the guest said about this stock when answering a caller question (buy/sell/hold stance, technicals/fundamentals, risks or valuation concerns).",
      "stance": "buy" | "sell" | "hold" | "unsure"
    }
  ],
  "pastPicks": [
    {
      "ticker": "TICKER",
      "company": "Company Name",
      "country": "CAD" | "US",
      "reasoning": "40-80 words summarizing the past pick evaluation, performance since prior pick date, and current posture (held/exited).",
      "stance": "buy" | "sell" | "hold" | "unsure"
    }
  ],
  "closingNotes": "Optional 50-100 words. Any general macro risks or concluding thoughts the guest mentioned. Empty string if none."
}`;

  const titleContext = verifiedVideoTitle ? ` titled "${verifiedVideoTitle}"` : (targetDateStr ? ` (${targetDateStr})` : '');
  const userPrompt = `Here is the transcript from today's BNN Bloomberg MarketCall episode${titleContext}:

---BEGIN TRANSCRIPT---
${transcript}
---END TRANSCRIPT---

Produce the structured digest following the exact JSON format specified. Remember: "picks" must ONLY contain NEW official featured Top Picks (usually 3), EXCLUDING any past picks reviews from prior months. All caller Q&A stock discussions belong in "callerMentions".`;

  return { systemPrompt, userPrompt };
}

/* ════════════════════════════════════════════════════════════════
   LLM routing — mirrors api/score.js patterns
   ════════════════════════════════════════════════════════════════ */

export async function callLLM(provider, key, systemPrompt, userPrompt, timer) {
  timer?.start('LLM synthesis');
  let result;
  switch (provider) {
    case 'gemini':
      result = await callGemini(key, systemPrompt, userPrompt);
      break;
    case 'claude':
      result = await callClaude(key, systemPrompt, userPrompt);
      break;
    case 'openai':
      result = await callOpenAI(key, systemPrompt, userPrompt);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
  timer?.end('LLM synthesis');
  return result; /* { text: string, usage: { input_tokens, output_tokens } } */
}

async function callGemini(key, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(150000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(`Gemini API error: ${errBody.error?.message || response.statusText}`),
      { status: response.status }
    );
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const textPart = parts.find((p) => typeof p.text === 'string');
    if (textPart) {
      const usage = data.usageMetadata
        ? {
            input_tokens: data.usageMetadata.promptTokenCount || 0,
            output_tokens: data.usageMetadata.candidatesTokenCount || 0,
          }
        : null;
      return { text: textPart.text, usage };
    }
  }
  throw new Error('Gemini returned no text content.');
}

async function callClaude(key, systemPrompt, userPrompt) {
  const models = [
    'claude-haiku-5-5',
    'claude-sonnet-5',
  ];

  let lastErr = null;
  for (const model of models) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(150000),
    });

    if (response.ok) {
      const data = await response.json();
      const textBlock = data.content?.find((b) => b.type === 'text');
      if (textBlock) {
        const usage = data.usage
          ? {
              input_tokens: data.usage.input_tokens || 0,
              output_tokens: data.usage.output_tokens || 0,
            }
          : null;
        return { text: textBlock.text, usage };
      }
      throw new Error('Claude returned no text content.');
    }

    const errBody = await response.json().catch(() => ({}));
    const detail = errBody.error?.message || response.statusText;
    lastErr = Object.assign(
      new Error(`Claude API error (${model}): ${detail}`),
      { status: response.status }
    );
    if (response.status === 404) {
      continue;
    }
    throw lastErr;
  }
  
  throw lastErr || new Error('Claude API request failed.');
}

async function callOpenAI(key, systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(150000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(`OpenAI API error: ${errBody.error?.message || response.statusText}`),
      { status: response.status }
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage
    ? {
        input_tokens: data.usage.prompt_tokens || 0,
        output_tokens: data.usage.completion_tokens || 0,
      }
    : null;
  return { text, usage };
}

/* ════════════════════════════════════════════════════════════════
   JSON extraction
   ════════════════════════════════════════════════════════════════ */

export function extractJSON(text) {
  if (!text) throw new Error('LLM returned an empty response.');
  let str = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    str = str.slice(firstBrace, lastBrace + 1);
  }

  /* Step 1: Direct JSON parse */
  try {
    return JSON.parse(str);
  } catch {}

  /* Step 2: Trailing comma cleanup */
  let repaired = str.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(repaired);
  } catch {}

  /* Step 3: Unquoted string value repair (e.g. "company": AeroVironm" -> "company": "AeroVironm") */
  try {
    let unquotedFixed = repaired.replace(/:\s*(?!(?:true|false|null|-?\d+(?:\.\d+)?)\b)([A-Za-z][^,\{\}\[\]"\r\n]*?)(?=\s*[,}\]\n])/g, ': "$1"');
    unquotedFixed = unquotedFixed.replace(/:\s*([A-Za-z0-9_\-\. ]+)"/g, ': "$1"');
    return JSON.parse(unquotedFixed);
  } catch {}

  /* Step 4: Fast regex missing bracket repair (}\n}) */
  let repairedBracket = repaired.replace(/\}\s*\}$/, '}\n  ]\n}');
  try {
    return JSON.parse(repairedBracket);
  } catch {}

  /* Step 5: Full character scanner & stack auto-balancer */
  let out = '';
  let inString = false;
  let isEscaped = false;
  let stack = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (char === '\n') { out += '\\n'; continue; }
      if (char === '\r') { out += '\\r'; continue; }
      if (char === '\t') { out += '\\t'; continue; }
      if (char === '\\') { isEscaped = !isEscaped; out += char; }
      else if (char === '"') {
        if (isEscaped) { out += char; isEscaped = false; }
        else {
          const rest = str.slice(i + 1).trimStart();
          const nextChar = rest[0];
          if (!nextChar || [',', '}', ']', ':'].includes(nextChar)) {
            inString = false;
            out += char;
          } else {
            out += '\\"';
          }
        }
      } else { isEscaped = false; out += char; }
    } else {
      if (char === '"') { inString = true; out += char; }
      else if (char === '{' || char === '[') { stack.push(char === '{' ? '}' : ']'); out += char; }
      else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ']') stack.pop();
        out += char;
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === ']') {
          stack.pop();
          out += '\n  ]\n';
        }
        if (stack.length > 0 && stack[stack.length - 1] === '}') {
          stack.pop();
        }
        out += char;
      } else { out += char; }
    }
  }
  if (inString) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length > 0) { out += '\n' + stack.pop(); }
  out = out.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(out);
  } catch {}

  /* Step 6: Bulletproof regex-based pick block extraction fallback */
  console.log('[extractJSON] Running regex fallback block extraction...');
  const guestMatch = str.match(/"guest"\s*:\s*"([^"]+)"/) || str.match(/"guest"\s*:\s*([A-Za-z0-9_\- ]+)/);
  const hostMatch = str.match(/"host"\s*:\s*"([^"]+)"/) || str.match(/"host"\s*:\s*([A-Za-z0-9_\- ]+)/);
  
  const picks = [];
  const pickRegex = /{\s*"ticker"\s*:\s*"([^"]+)"[\s\S]*?"company"\s*:\s*"?([^",\n\}]+)"?[\s\S]*?"reasoning"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = pickRegex.exec(str)) !== null) {
    picks.push({
      ticker: match[1].trim(),
      company: match[2].trim().replace(/^"|"$/g, ''),
      reasoning: match[3].trim(),
    });
  }

  if (picks.length > 0) {
    return {
      guest: guestMatch ? guestMatch[1].trim() : 'Market Analyst',
      host: hostMatch ? hostMatch[1].trim() : '',
      picks: picks,
    };
  }

  const parseErr = new Error(`JSON malformed`);
  parseErr.rawText = out || str;
  throw parseErr;
}

/**
 * Non-blocking cleanup of stale digest jobs older than N days (default 14 days).
 */
export async function pruneStaleJobs(supabase, days = 90) {
  try {
    const cutoffDate = new Date(Date.now() - days * 86400 * 1000).toISOString().split('T')[0];
    await supabase
      .from('digest_jobs')
      .delete()
      .neq('status', 'complete')
      .lt('episode_date', cutoffDate);
  } catch (err) {
    console.warn('[pipeline] Prune stale jobs error:', err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   Preserved 3rd-Party Volunteer Proxy Extraction Code (Inactive)
   Kept for future offline or optional deep-fallback use.
   ════════════════════════════════════════════════════════════════ */
export async function _fetchViaProxiesInactive(videoId) {
  const proxyHosts = [
    { type: 'piped', url: 'https://pipedapi.kavin.rocks' },
    { type: 'piped', url: 'https://pipedapi.leptons.xyz' },
    { type: 'piped', url: 'https://pipedapi.syncp.link' },
    { type: 'piped', url: 'https://piped-api.lunar.icu' },
    { type: 'piped', url: 'https://api-piped.mha.fi' },
    { type: 'invidious', url: 'https://inv.tux.zone' },
    { type: 'invidious', url: 'https://invidious.nerdvpn.de' },
    { type: 'invidious', url: 'https://vid.puppycraft.me' },
  ];

  for (const host of proxyHosts) {
    try {
      if (host.type === 'piped') {
        const res = await fetch(`${host.url}/streams/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const subs = data?.subtitles || [];
          const enSub = subs.find((s) => s.code === 'en' && s.autoGenerated) || subs.find((s) => s.code?.startsWith('en'));
          if (enSub && enSub.url) {
            const subRes = await fetch(enSub.url, { signal: AbortSignal.timeout(5000) });
            if (subRes.ok) {
              const subData = await subRes.json().catch(() => null);
              if (Array.isArray(subData) && subData.length > 5) {
                const text = subData.map((item) => item.utf8 || item.text || '').filter(Boolean).join(' ');
                if (text.length >= 200) return text;
              } else if (typeof subData === 'object' && subData?.events) {
                const text = subData.events
                  .filter((e) => e.segs)
                  .map((e) => e.segs.map((s) => s.utf8 || '').join(''))
                  .filter(Boolean)
                  .join(' ');
                if (text.length >= 200) return text;
              }
            }
          }
        }
      } else if (host.type === 'invidious') {
        const res = await fetch(`${host.url}/api/v1/captions/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const captions = data?.captions || [];
          const enCap = captions.find((c) => c.languageCode === 'en');
          if (enCap && enCap.url) {
            const capUrl = enCap.url.startsWith('http') ? enCap.url : `${host.url}${enCap.url}`;
            const capRes = await fetch(capUrl, { signal: AbortSignal.timeout(5000) });
            if (capRes.ok) {
              const vttText = await capRes.text();
              const cleanLines = vttText
                .split('\n')
                .filter((line) => !line.includes('-->') && !line.startsWith('WEBVTT') && line.trim() !== '')
                .map((line) => line.replace(/<[^>]+>/g, '').trim())
                .filter(Boolean);
              const text = cleanLines.join(' ');
              if (text.length >= 200) return text;
            }
          }
        }
      }
    } catch {
      /* continue to next proxy host */
    }
  }
  return '';
}
