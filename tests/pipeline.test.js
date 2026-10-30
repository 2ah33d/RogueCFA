import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDigestResult, CANONICAL_TICKER_MAP, CANONICAL_REVERSE_TICKER_MAP } from '../api/_pipeline.js';

test('sanitizeDigestResult collapses 4-entry Cogeco payload (CCI/CJR/CJR.B/CGO) to 1 CCA entry', () => {
  const payload = {
    picks: [
      { ticker: 'CCI', company: 'Cogeco', reasoning: 'First mention of Cogeco.' },
      { ticker: 'CJR.B', company: 'Cogeco Communications', reasoning: 'Second mention of Cogeco.' },
      { ticker: 'CGO', company: 'Kojiko', reasoning: 'Phonetic ASR mention.' },
      { ticker: 'CCA', company: 'Cogeco Communications Inc', reasoning: 'Official ticker mention.' },
    ],
  };

  const result = sanitizeDigestResult(payload);

  assert.equal(result.picks.length, 1, 'Should collapse all 4 variants to exactly 1 pick');
  assert.equal(result.picks[0].ticker, 'CCA', 'Ticker must be CCA');
  assert.equal(result.picks[0].company, 'Cogeco Communications', 'Company must be Cogeco Communications');
  assert.ok(result.picks[0].reasoning.includes('First mention'), 'Reasoning should merge entries');
  assert.ok(result.picks[0].reasoning.includes('Official ticker'), 'Reasoning should merge entries');
});

test('sanitizeDigestResult collapses 2-entry Cogeco payload (CCA + Cogeco Inc. (Videotron/Cable subsidiary)/CCI) to 1 CCA entry', () => {
  const payload = {
    callerMentions: [
      {
        ticker: 'CCA',
        company: 'Cogeco Communications',
        reasoning: 'Gardner avoids Cogeco pending proof of US turnaround.',
        stance: 'hold',
      },
      {
        ticker: 'CCI',
        company: 'Cogeco Inc. (Videotron/Cable subsidiary)',
        reasoning: 'Gardner prefers Quebecor over Cogeco.',
        stance: 'hold',
      },
    ],
  };

  const result = sanitizeDigestResult(payload);

  assert.equal(result.callerMentions.length, 1, 'Should collapse 2-entry Cogeco payload to exactly 1 entry');
  assert.equal(result.callerMentions[0].ticker, 'CCA', 'Ticker must be normalized to CCA');
  assert.equal(result.callerMentions[0].company, 'Cogeco Communications', 'Parenthetical details stripped and company normalized');
});

test('sanitizeDigestResult corrects hallucinated ticker EFP to EFN for Element Fleet Management', () => {
  const payload = {
    picks: [
      {
        ticker: 'EFP',
        company: 'Element Fleet Management',
        reasoning: 'Strong fleet leasing growth.',
        stance: 'buy',
      },
    ],
  };

  const result = sanitizeDigestResult(payload);

  assert.equal(result.picks.length, 1);
  assert.equal(result.picks[0].ticker, 'EFN', 'EFP must be corrected to EFN');
  assert.equal(result.picks[0].company, 'Element Fleet Management');
});

test('sanitizeDigestResult populates digest._warnings and logs warning when transcript has Past Picks markers but pastPicks is empty', () => {
  const payload = {
    picks: [{ ticker: 'TD', company: 'Toronto-Dominion Bank', reasoning: 'Banking thesis.' }],
    pastPicks: [],
  };

  const transcript = 'Welcome back to Market Call. Looking back at your past picks from 6 months ago... We did sell Abbott Labs.';

  let warningLogged = false;
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args.join(' ').includes('WARNING: Transcript text contains Past Picks review markers')) {
      warningLogged = true;
    }
    originalWarn(...args);
  };

  let result;
  try {
    result = sanitizeDigestResult(payload, transcript);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warningLogged, true, 'Console warning should be logged for empty pastPicks');
  assert.ok(Array.isArray(result._warnings), '_warnings array must exist');
  assert.equal(result._warnings.length, 1, '_warnings should contain 1 warning entry');
  assert.ok(result._warnings[0].includes('pastPicks is empty'), '_warnings entry should describe pastPicks degradation');
});

test('word-boundary fuzzy matching prevents substring collisions on generic company names', () => {
  const payload = {
    picks: [
      {
        ticker: 'XYZ',
        company: 'LADYBIRD INC', // Contains "BIRD" as substring, but is NOT "BIRD CONSTRUCTION"
        reasoning: 'Unrelated company testing boundary match.',
      },
    ],
  };

  const result = sanitizeDigestResult(payload);

  assert.equal(result.picks[0].ticker, 'XYZ', 'Should not match BDT for LADYBIRD');
  assert.equal(result.picks[0].company, 'LADYBIRD INC', 'No false positive canonical match for LADYBIRD');
});

test('extractDateFromTitle accurately parses dates with and without abbreviation dots', async () => {
  const { extractDateFromTitle } = await import('../api/_youtubeFetcher.js');
  assert.equal(extractDateFromTitle('Jamie Murrays’ Market Outlook: AI Trade (Aug. 18, 2026)'), '2026-08-18');
  assert.equal(extractDateFromTitle('Market Call: Keith Richards\' outlook on Technical Analysis (Aug. 17, 2026)'), '2026-08-17');
  assert.equal(extractDateFromTitle('Market Call: Tim Regan\'s outlook on North American Large Caps (July 29, 2026)'), '2026-07-29');
  assert.equal(extractDateFromTitle('Richard Orrell\'s Market Outlook: ETFs (Aug 14, 2026)'), '2026-08-14');
});

test('extractAnalystFromYouTubeTitle extracts guest from Market Outlook and possessive typos', async () => {
  const { extractAnalystFromYouTubeTitle } = await import('../api/_pipeline.js');
  assert.equal(extractAnalystFromYouTubeTitle('Jamie Murrays’ Market Outlook: AI Trade (Aug. 18, 2026)'), 'Jamie Murray');
  assert.equal(extractAnalystFromYouTubeTitle('Keith Richards\' Market Outlook: Technical Analysis (Aug. 17, 2026)'), 'Keith Richards');
  assert.equal(extractAnalystFromYouTubeTitle('Chris Blumas\' Market Outlook: North American Large Caps (Aug. 12, 2026)'), 'Chris Blumas');
  assert.equal(extractAnalystFromYouTubeTitle('Christine Poole\'s Market Outlook: Canadian Dividend Stocks (Aug. 11, 2026)'), 'Christine Poole');
});

test('findMatchingYtVideo matches Market Outlook titles with target date', async () => {
  const { findMatchingYtVideo } = await import('../api/_pipeline.js');
  const candidates = [
    { videoId: 'O8OTYPsSkyk', videoTitle: 'Jamie Murrays’ Market Outlook: AI Trade (Aug. 18, 2026)', publishDate: '2026-08-18' },
    { videoId: 'aYrH7EAEp6g', videoTitle: "Market Call: Keith Richards' outlook on Technical Analysis (Aug. 17, 2026)", publishDate: '2026-08-17' },
  ];
  const match = findMatchingYtVideo(candidates, '2026-08-18');
  assert.ok(match, 'Must find matching video for 2026-08-18');
  assert.equal(match.videoId, 'O8OTYPsSkyk', 'Must match videoId O8OTYPsSkyk');
});

test('extracts and sorts available audio dates from Supabase Storage file objects', () => {
  const fileObjects = [
    { name: 'marketcall-2026-09-02.m4a' },
    { name: 'marketcall-2026-09-04.m4a' },
    { name: 'marketcall-2026-09-03.m4a' },
    { name: 'irrelevant_file.txt' },
  ];
  const dates = fileObjects
    .map((f) => f.name?.match(/marketcall-(\d{4}-\d{2}-\d{2})\.m4a/)?.[1])
    .filter(Boolean)
    .sort()
    .reverse();

  assert.deepEqual(dates, ['2026-09-04', '2026-09-03', '2026-09-02'], 'Must accurately extract and sort audio dates in reverse chronological order');
});

test('7-calendar-day rolling retention preserves 5 weekday broadcast episodes across weekends', () => {
  // Simulate checking files on Friday 2026-09-04 with a 7-day cutoff (2026-08-28)
  const simulatedNowUtc = new Date('2026-09-04T18:00:00Z');
  const cutoffDate = new Date(simulatedNowUtc.getTime() - 7 * 86400 * 1000).toISOString().split('T')[0];

  assert.equal(cutoffDate, '2026-08-28');

  // Monday through Friday episodes of the current week must ALL be preserved
  const currentWeekEpisodes = [
    'marketcall-2026-08-31.m4a', // Monday
    'marketcall-2026-09-01.m4a', // Tuesday
    'marketcall-2026-09-02.m4a', // Wednesday
    'marketcall-2026-09-03.m4a', // Thursday
    'marketcall-2026-09-04.m4a', // Friday
  ];

  for (const ep of currentWeekEpisodes) {
    const fileDate = ep.match(/marketcall-(\d{4}-\d{2}-\d{2})\.m4a/)[1];
    assert.ok(fileDate >= cutoffDate, `${ep} should be retained inside the rolling 7-day window`);
  }

  // An episode older than 7 days should be pruned
  const oldEp = 'marketcall-2026-08-27.m4a';
  const oldFileDate = oldEp.match(/marketcall-(\d{4}-\d{2}-\d{2})\.m4a/)[1];
  assert.ok(oldFileDate < cutoffDate, `${oldEp} should be marked for pruning`);
});

test('findMatchingYtVideo returns null when target date has no matching video (no yesterday fallback)', async () => {
  const { findMatchingYtVideo } = await import('../api/_pipeline.js');
  const candidates = [
    { videoId: 'qoFxiVFlMps', videoTitle: "Market Call: Greg Newman's outlook on North American Stocks (Sept. 11, 2026)", publishDate: '2026-09-11' },
    { videoId: '8bQ6Fj9Wo0c', videoTitle: "Market Call: Greg Newman's outlook on North American Stocks (Sept. 11, 2026)", publishDate: '2026-09-11' },
  ];
  // Candidate is from Sept 11, but target date is Sept 10
  const match = findMatchingYtVideo(candidates, '2026-09-10');
  assert.equal(match, null, 'Must return null and never match yesterday or adjacent day');
});

test('resolveAnalystName respects audio-heard name, BNN article validation, and sets disclaimer for audio-only', async () => {
  const { resolveAnalystName } = await import('../api/_pipeline.js');

  // Case 1: Audio heard name with no external confirmation
  const audioOnly = resolveAnalystName('Stan Wong', '', '', '', '2026-09-10');
  assert.equal(audioOnly.name, 'Stan Wong');
  assert.equal(audioOnly.confidence, 'audio_only');
  assert.ok(audioOnly.disclaimer.includes('Analyst name heard from live audio broadcast'));

  // Case 2: Mismatched video from a different day MUST NOT override audio name
  const mismatchedYt = resolveAnalystName(
    'Stan Wong',
    "Market Call: Greg Newman's outlook on North American Stocks (Sept. 11, 2026)",
    '',
    '',
    '2026-09-10' // target date is Sept 10, video is Sept 11
  );
  assert.equal(mismatchedYt.name, 'Stan Wong', 'Must keep Stan Wong and reject Greg Newman from Sept 11 video');
  assert.equal(mismatchedYt.confidence, 'audio_only');

  // Case 3: Exact date-verified YouTube title
  const dateVerifiedYt = resolveAnalystName(
    'Stan Wong',
    "Market Call: Stan Wong's outlook on North American Large Caps (Sept. 10, 2026)",
    '',
    '',
    '2026-09-10'
  );
  assert.equal(dateVerifiedYt.name, 'Stan Wong');
  assert.equal(dateVerifiedYt.confidence, 'verified_youtube');

  // Case 4: Authoritative BNN article
  const bnnArticle = resolveAnalystName('Stan Wong', '', '', 'Stan Wong', '2026-09-10');
  assert.equal(bnnArticle.name, 'Stan Wong');
  assert.equal(bnnArticle.confidence, 'official_article');
});

test('detectConsecutiveDayDouble flags double guest and overlapping picks', async () => {
  const { detectConsecutiveDayDouble } = await import('../api/_pipeline.js');

  const mockSupabase = {
    from: () => ({
      select: () => ({
        lt: () => ({
          eq: () => ({
            not: () => ({
              order: () => ({
                limit: () => Promise.resolve({
                  data: [
                    {
                      id: 'live-2026-09-10',
                      episode_date: '2026-09-10',
                      result: {
                        digest: {
                          guest: 'Greg Newman',
                          picks: [{ ticker: 'NVDA' }, { ticker: 'AAPL' }, { ticker: 'MSFT' }],
                        },
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };

  // Same guest as previous day
  const resultDouble = await detectConsecutiveDayDouble(
    '2026-09-11',
    {
      guest: 'Greg Newman',
      picks: [{ ticker: 'NVDA' }, { ticker: 'CP' }, { ticker: 'GOOGL' }],
    },
    mockSupabase
  );

  assert.ok(resultDouble, 'Should detect consecutive double');
  assert.equal(resultDouble.isDouble, true);
  assert.equal(resultDouble.matchedGuest, true);
  assert.ok(resultDouble.warningMessage.includes('identical analyst (Greg Newman)'));

  // Different guest and different picks
  const resultClean = await detectConsecutiveDayDouble(
    '2026-09-11',
    {
      guest: 'Ivana Delevska',
      picks: [{ ticker: 'AMD' }, { ticker: 'TSM' }, { ticker: 'ARM' }],
    },
    mockSupabase
  );

  assert.equal(resultClean, null, 'Clean episode must not be flagged');
});

test('findMatchingYtVideo returns null when candidate video has loose publish timestamp but conflicting title date', async () => {
  const { findMatchingYtVideo } = await import('../api/_pipeline.js');
  const candidates = [
    {
      videoId: 'PXFk79okubo',
      videoTitle: "Market Call: Ivana Delevska's outlook on Technology Stocks (Sept. 16, 2026)",
      publishedAt: '2026-09-17T02:00:00Z', // Published in early UTC on Sept 17, but is Sept 16 show
    },
  ];
  const match = findMatchingYtVideo(candidates, '2026-09-17');
  assert.equal(match, null, 'Must reject video because title date (Sept. 16) contradicts target date (2026-09-17)');
});

test('buildDigestPrompt rejects mismatched video title date and instructs transcript extraction', async () => {
  const { buildDigestPrompt } = await import('../api/_pipeline.js');
  const transcript = 'Thanks for joining us today here on Market Call. Martin Cobb with us on the show. Senior Vice President Equities at Lauren Steinberg Wealth Management.';
  
  // Passed Sept 16 videoTitle for Sept 17 targetDateStr
  const { systemPrompt, userPrompt } = buildDigestPrompt(
    transcript,
    "Market Call: Ivana Delevska's outlook on Technology Stocks (Sept. 16, 2026)",
    '',
    '2026-09-17'
  );

  assert.ok(systemPrompt.includes('Extract the guest\'s real full name and firm accurately from the host\'s introduction'), 'Must instruct LLM to extract from transcript');
  assert.ok(!systemPrompt.includes('Ivana Delevska'), 'Must NOT inject Ivana Delevska into the prompt for Sept 17');
  assert.ok(!userPrompt.includes('Ivana Delevska'), 'User prompt must NOT contain mismatched video title');
  assert.ok(userPrompt.includes('(2026-09-17)'), 'User prompt must reference target date');
});

test('buildDigestPrompt accepts verified matching video title and sets verified official guest', async () => {
  const { buildDigestPrompt } = await import('../api/_pipeline.js');
  const transcript = 'Welcome to Market Call.';
  
  const { systemPrompt, userPrompt } = buildDigestPrompt(
    transcript,
    "Market Call: Ivana Delevska's outlook on Technology Stocks (Sept. 16, 2026)",
    '',
    '2026-09-16'
  );

  assert.ok(systemPrompt.includes('The verified official guest name for this episode is "Ivana Delevska"'));
  assert.ok(userPrompt.includes("titled \"Market Call: Ivana Delevska's outlook on Technology Stocks (Sept. 16, 2026)\""));
});

test('isCanadianMarketHoliday accurately identifies TSX exchange holidays and normal trading days', async () => {
  const { isCanadianMarketHoliday } = await import('../api/_pipeline.js');

  assert.equal(isCanadianMarketHoliday('2026-10-12'), true, '2026-10-12 is Canadian Thanksgiving');
  assert.equal(isCanadianMarketHoliday('2026-09-07'), true, '2026-09-07 is Labour Day');
  assert.equal(isCanadianMarketHoliday('2026-07-01'), true, '2026-07-01 is Canada Day');
  assert.equal(isCanadianMarketHoliday('2026-10-06'), false, '2026-10-06 is a normal trading Tuesday');
  assert.equal(isCanadianMarketHoliday('2026-10-09'), false, '2026-10-09 is a normal trading Friday');
});

test('resolveAnalystName resolves Ryan Madden phonetic mishearing to Brian Madden', async () => {
  const { resolveAnalystName } = await import('../api/_pipeline.js');

  const resolved = resolveAnalystName('Ryan Madden');
  assert.equal(resolved.name, 'Brian Madden', 'Ryan Madden must be disambiguated to Brian Madden');
  assert.equal(resolved.confidence, 'phonetic_override');
});

test('detectRebroadcastOrDuplicate identifies 14-day holiday syndicated rebroadcast', async () => {
  const { detectRebroadcastOrDuplicate } = await import('../api/_pipeline.js');

  const mockSupabase = {
    from: () => ({
      select: () => ({
        lt: () => ({
          gte: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: 'live-2026-10-09',
                        episode_date: '2026-10-09',
                        result: {
                          digest: {
                            guest: 'Brian Madden',
                            picks: [{ ticker: 'FTS' }, { ticker: 'LLY' }, { ticker: 'XOM' }],
                          },
                        },
                      },
                      {
                        id: 'live-2026-10-06',
                        episode_date: '2026-10-06',
                        result: {
                          digest: {
                            guest: 'Kim Bolton',
                            picks: [{ ticker: 'TSEM' }, { ticker: 'PLTR' }, { ticker: 'CEG' }],
                          },
                        },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };

  const newDigest = {
    guest: 'Kim Bolton',
    picks: [{ ticker: 'TSEM' }, { ticker: 'PLTR' }, { ticker: 'CEG' }],
  };

  const check = await detectRebroadcastOrDuplicate('2026-10-12', newDigest, mockSupabase);
  assert.ok(check, 'Must detect duplicate check result');
  assert.equal(check.isRebroadcast, true, 'Must flag as rebroadcast');
  assert.equal(check.originalDate, '2026-10-06', 'Original date must be 2026-10-06');
  assert.equal(check.isHolidayRebroadcast, true, 'Must identify as holiday rebroadcast on Thanksgiving');
});

test('parseBnnPastPicksArticle extracts true historical pick date from PAST PICKS header and disambiguates title', async () => {
  const { parseBnnPastPicksArticle } = await import('../api/_bnnScraper.js');

  const html = `
    <html>
      <head><title>AI stocks drop as tech weighs: Brian Madden’s Top Picks for Sept. 4, 2026 – BNN Bloomberg</title></head>
      <body>
        <h1>TOP PICKS</h1>
        <p>Teck Resources (TECK.B TSX)</p>
        <h2>PAST PICKS: SEPT. 18, 2025</h2>
        <p>Constellation Software (CSU TSX) Then: $4310.95 Now: $2952.50 Return: -32% Total Return: -31%</p>
        <p>KKR (KKR NYSE) Then: US$149.34 Now: US$107.17 Return: -28% Total Return: -28%</p>
        <p>Telus (T TSX) Then: $21.83 Now: $13.35 Return: -39% Total Return: -33%</p>
      </body>
    </html>
  `;

  const rows = parseBnnPastPicksArticle(html, 'https://www.bnnbloomberg.ca/markets/2026/09/04/brian-maddens-top-picks-for-sept-4-2026/', 'Ryan Madden');

  assert.equal(rows.length, 3, 'Must extract 3 past picks');
  assert.equal(rows[0].analyst_name, 'Brian Madden', 'Must extract Brian Madden and not AI stocks drop or Ryan Madden');
  assert.equal(rows[0].pick_publish_date, '2025-09-18', 'Must use original initiation date 2025-09-18, NOT article review date 2026-09-04');
  assert.equal(rows[0].ticker, 'CSU.TO', 'Ticker must be formatted with .TO');
  assert.equal(rows[1].ticker, 'KKR');
  assert.equal(rows[2].ticker, 'T.TO');
});

test('extractDateFromTranscript accurately parses verbal host date declarations from audio intro', async () => {
  const { extractDateFromTranscript } = await import('../api/_pipeline.js');

  const t1 = "Welcome to Market Call for Tuesday, October 6th, 2026. I'm Michael Hainsworth. Kim Bolton with us today...";
  assert.equal(extractDateFromTranscript(t1), '2026-10-06');

  const t2 = "Good afternoon and welcome to Market Call on this Tuesday, October 6th. Joining us today is Kim Bolton...";
  assert.equal(extractDateFromTranscript(t2, 2026), '2026-10-06');

  const t3 = "Welcome to Market Call, Friday, October 9th, 2026. Brian Madden is our guest...";
  assert.equal(extractDateFromTranscript(t3), '2026-10-09');

  const t4 = "Today is Tuesday, October 6th. We're talking technology stocks with Kim Bolton...";
  assert.equal(extractDateFromTranscript(t4, 2026), '2026-10-06');

  const t5 = "This episode broadcast on October the 6th, 2026 with Kim Bolton.";
  assert.equal(extractDateFromTranscript(t5), '2026-10-06');

  const tNone = "Welcome to the show. Let's look at the market rally today with tech stocks soaring...";
  assert.equal(extractDateFromTranscript(tNone, 2026), null);
});

test('detectBroadcastDateMismatch halts generation when content date contradicts target generation date', async () => {
  const { detectBroadcastDateMismatch } = await import('../api/_pipeline.js');

  // Case 1: Audio from Oct 6 rerun presented on Oct 12 holiday
  const oct6Transcript = "Welcome to Market Call for Tuesday, October 6th, 2026. Kim Bolton with us today...";
  const mismatch = detectBroadcastDateMismatch('2026-10-12', {
    transcript: oct6Transcript,
    title: "BNN Bloomberg Market Call (Live Broadcast)",
  });
  assert.equal(mismatch.hasMismatch, true, 'Must detect date mismatch');
  assert.equal(mismatch.detectedDate, '2026-10-06');
  assert.equal(mismatch.targetDate, '2026-10-12');
  assert.ok(mismatch.reason.includes('2026-10-06'), 'Reason must cite detected date');
  assert.ok(mismatch.reason.includes('2026-10-12'), 'Reason must cite target date');

  // Case 2: Matching date
  const match = detectBroadcastDateMismatch('2026-10-06', {
    transcript: oct6Transcript,
    title: "BNN Bloomberg Market Call (Oct. 6, 2026)",
  });
  assert.equal(match.hasMismatch, false, 'No mismatch when content matches target date');
  assert.equal(match.detectedDate, '2026-10-06');

  // Case 3: Title date mismatch
  const titleMismatch = detectBroadcastDateMismatch('2026-10-12', {
    title: "Kim Bolton's Market Outlook: Technology Stocks (Oct. 6, 2026)",
  });
  assert.equal(titleMismatch.hasMismatch, true);
  assert.equal(titleMismatch.detectedDate, '2026-10-06');
});

test('matchKnownAnalyst dynamically disambiguates phonetic audio mishearings without hardcoded 1-off overrides', async () => {
  const { matchKnownAnalyst, levenshteinDistance } = await import('../api/_pipeline.js');

  assert.equal(levenshteinDistance('Ryan Madden', 'Brian Madden'), 2);
  assert.equal(levenshteinDistance('Tim Bolton', 'Kim Bolton'), 1);
  assert.equal(levenshteinDistance('Dan Wong', 'Stan Wong'), 2);

  // Ryan Madden -> Brian Madden (Levenshtein distance 1 on first name + exact last name)
  const m1 = matchKnownAnalyst('Ryan Madden');
  assert.equal(m1.matched, true);
  assert.equal(m1.name, 'Brian Madden');

  // Tim Bolton -> Kim Bolton
  const m2 = matchKnownAnalyst('Tim Bolton');
  assert.equal(m2.matched, true);
  assert.equal(m2.name, 'Kim Bolton');

  // Dan Wong -> Stan Wong
  const m3 = matchKnownAnalyst('Dan Wong');
  assert.equal(m3.matched, true);
  assert.equal(m3.name, 'Stan Wong');

  // Bruce Gamble -> Bruce Campbell (edit distance 2)
  const m4 = matchKnownAnalyst('Bruce Gamble');
  assert.equal(m4.matched, true);
  assert.equal(m4.name, 'Bruce Campbell');

  // Firm corroboration: "Bryan" with firm "First Avenue"
  const m5 = matchKnownAnalyst('Bryan', 'First Avenue Investment Counsel');
  assert.equal(m5.matched, true);
  assert.equal(m5.name, 'Brian Madden');

  // Unknown brand-new analyst: stays unmodified without false coercion
  const m6 = matchKnownAnalyst('Sarah Jenkins');
  assert.equal(m6.matched, false);
  assert.equal(m6.name, 'Sarah Jenkins');
});

test('normalizeAnalystName in _bnnScraper leverages dynamic fuzzy matcher', async () => {
  const { normalizeAnalystName } = await import('../api/_bnnScraper.js');

  assert.equal(normalizeAnalystName('Ryan Madden, Chief Investment Officer, First Avenue'), 'Brian Madden');
  assert.equal(normalizeAnalystName('Tim Bolton, Senior Portfolio Manager'), 'Kim Bolton');
  assert.equal(normalizeAnalystName('Dan Wong, Portfolio Manager'), 'Stan Wong');
  assert.equal(normalizeAnalystName('Julien Nono-Wamden'), 'Julien Nono-Womdim');
  assert.equal(normalizeAnalystName('Julian Klymochko'), 'Julian Klymochko');
});

test('resolveAnalystName respects authoritative schedule and database fuzzy fallback', async () => {
  const { resolveAnalystName } = await import('../api/_pipeline.js');

  // Priority 1: Authoritative schedule / article guest overrides heard audio name
  const r1 = resolveAnalystName('Ryan Madden', '', '', 'Brian Madden', '2026-10-09');
  assert.equal(r1.name, 'Brian Madden');
  assert.equal(r1.confidence, 'official_article');

  // Priority 3: When no article or video schedule is present, database fuzzy matcher automatically resolves
  const r2 = resolveAnalystName('Dan Wong');
  assert.equal(r2.name, 'Stan Wong');
  assert.equal(r2.confidence, 'database_fuzzy_match');
  // Priority 3: Resolves phonetic audio mishearings for Richard Orrell and Chris Blumas
  const r4 = resolveAnalystName('Richard Arell', '', '', null, '2026-10-16', 'Portfolio Manager, R.N. Croft Financial Group');
  assert.equal(r4.name, 'Richard Orrell');
  assert.equal(r4.disclaimer, null);

  const r5 = resolveAnalystName('Chris Blumis', '', '', null, '2026-10-14', 'Raymond James');
  assert.equal(r5.name, 'Chris Blumas');
  assert.equal(r5.disclaimer, null);
});

test('buildCoreDigestPrompt includes Top Picks and Past Picks but excludes caller questions', async () => {
  const { buildCoreDigestPrompt } = await import('../api/_pipeline.js');
  const prompt = buildCoreDigestPrompt('Mock transcript text', 'BNN Market Call', '2026-10-29');

  assert.ok(prompt.systemPrompt.includes('"pastPicks"'), 'Core prompt must include pastPicks');
  assert.ok(prompt.systemPrompt.includes('"picks"'), 'Core prompt must include picks');
  assert.ok(prompt.systemPrompt.includes('DO NOT extract caller Q&A'), 'Core prompt must exclude caller questions');
});

test('buildCallerMentionsPrompt focuses exclusively on exhaustive caller Q&A', async () => {
  const { buildCallerMentionsPrompt } = await import('../api/_pipeline.js');
  const prompt = buildCallerMentionsPrompt('Mock transcript text', 'BNN Market Call', '2026-10-29');

  assert.ok(prompt.systemPrompt.includes('"callerMentions"'), 'Caller prompt must output callerMentions');
  assert.ok(prompt.systemPrompt.includes('EXHAUSTIVE COVERAGE'), 'Caller prompt must enforce exhaustive coverage');
  assert.ok(prompt.systemPrompt.includes('DO NOT include the guest\'s official new Top Picks'), 'Caller prompt must omit Top Picks');
});

test('sanitizeDigestResult detects caller under-extraction when transcript has caller cues', () => {
  const mockTranscript = `
    Hi, we have Wendy calling in from Vancouver with a question on Apple.
    Next caller, we have Bob calling in from Toronto asking about Tesla.
    Now an email question from Sarah about Amazon.
    Another email question from David on Microsoft.
    And a caller on the line from Calgary with a question on Nvidia.
  `;
  const sparseDigest = {
    guest: 'Darren Sissons',
    callerMentions: [{ ticker: 'AAPL', company: 'Apple', stance: 'buy', reasoning: 'Strong ecosystem.' }],
    _warnings: [],
  };

  const result = sanitizeDigestResult(sparseDigest, mockTranscript);
  assert.ok(result._warnings.some((w) => w.includes('Under-extraction warning')), 'Should flag caller under-extraction warning');
});



