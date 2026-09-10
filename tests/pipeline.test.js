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


