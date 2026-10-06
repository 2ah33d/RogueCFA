import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShortlists,
  buildLLMEyesPrompt,
  validateLLMEyesResponse,
  normalizeStance,
  weightedScore,
} from '../src/lib/goldenGoose.js';

test('buildShortlists strictly excludes tickers with zero buy ratings (even with multiple holds)', () => {
  const episodes = [
    {
      episodeDate: '2026-10-02',
      guest: 'Bruce Murray',
      callerMentions: [
        { ticker: 'BCE', company: 'BCE Inc.', stance: 'hold', reasoning: 'Dividend pressure.' },
        { ticker: 'CCJ', company: 'Cameco', stance: 'hold', reasoning: 'Wait for pullback.' },
        { ticker: 'T', company: 'Telus', stance: 'hold', reasoning: 'Competitive headwinds.' },
      ],
    },
    {
      episodeDate: '2026-10-01',
      guest: 'Dennis Mitchell',
      callerMentions: [
        { ticker: 'BCE', company: 'BCE Inc.', stance: 'hold', reasoning: 'Debt load concerns.' },
      ],
    },
    {
      episodeDate: '2026-09-28',
      guest: 'Paul Harris',
      callerMentions: [
        { ticker: 'BCE', company: 'BCE Inc.', stance: 'hold', reasoning: 'Yield trap risk.' },
        { ticker: 'T', company: 'Telus', stance: 'hold', reasoning: 'Telecom capex heavy.' },
      ],
    },
    {
      episodeDate: '2026-09-29',
      guest: 'Colin Szynski',
      callerMentions: [
        { ticker: 'CCJ', company: 'Cameco', stance: 'hold', reasoning: 'Valuation full.' },
      ],
    },
  ];

  const { buyHoldCandidates, sellCandidates } = buildShortlists(episodes, 30);

  const buyTickers = buyHoldCandidates.map((c) => c.ticker);
  assert.ok(!buyTickers.includes('BCE'), 'BCE with 3 holds and 0 buys must not be in buyHoldCandidates');
  assert.ok(!buyTickers.includes('CCJ'), 'CCJ with 2 holds and 0 buys must not be in buyHoldCandidates');
  assert.ok(!buyTickers.includes('T'), 'T with 2 holds and 0 buys must not be in buyHoldCandidates');
  assert.equal(buyHoldCandidates.length, 0, 'No zero-buy candidates should qualify');
});

test('buildShortlists excludes tickers with active SELL ratings from buy candidates and routes to sell candidates', () => {
  const episodes = [
    {
      episodeDate: '2026-10-02',
      guest: 'Bruce Murray',
      callerMentions: [
        { ticker: 'BN', company: 'Brookfield', stance: 'hold', reasoning: 'Fair value.' },
      ],
    },
    {
      episodeDate: '2026-09-29',
      guest: 'Colin Szynski',
      callerMentions: [
        { ticker: 'BN', company: 'Brookfield', stance: 'sell', reasoning: 'Real estate debt exposure.' },
      ],
    },
    {
      episodeDate: '2026-09-28',
      guest: 'Paul Harris',
      callerMentions: [
        { ticker: 'BN', company: 'Brookfield', stance: 'buy', reasoning: 'Long-term compounder.' },
      ],
    },
  ];

  const { buyHoldCandidates, sellCandidates } = buildShortlists(episodes, 30);

  const buyTickers = buyHoldCandidates.map((c) => c.ticker);
  const sellTickers = sellCandidates.map((c) => c.ticker);

  assert.ok(!buyTickers.includes('BN'), 'BN with a sell mention must be disqualified from buyHoldCandidates');
  assert.ok(sellTickers.includes('BN'), 'BN with a sell mention must appear in sellCandidates');
  assert.equal(sellCandidates[0].sellCount, 1, 'BN should show 1 sell');
});

test('buildShortlists accepts multi-analyst buy convergence and top pick confirmation', () => {
  const episodes = [
    {
      episodeDate: '2026-10-02',
      guest: 'Bruce Murray',
      picks: [
        { ticker: 'SHOP', company: 'Shopify', reasoning: 'E-commerce operating leverage accelerating.' },
      ],
      callerMentions: [
        { ticker: 'MRK', company: 'Merck', stance: 'hold', reasoning: 'Patent cliff concerns balanced by Keytruda.' },
      ],
    },
    {
      episodeDate: '2026-09-29',
      guest: 'Colin Szynski',
      picks: [
        { ticker: 'MRK', company: 'Merck', reasoning: 'Top pick: pipeline catalyst upcoming.' },
      ],
      callerMentions: [
        { ticker: 'SHOP', company: 'Shopify', stance: 'buy', reasoning: 'Solid free cash flow expansion.' },
      ],
    },
    {
      episodeDate: '2026-09-28',
      guest: 'Paul Harris',
      callerMentions: [
        { ticker: 'SHOP', company: 'Shopify', stance: 'buy', reasoning: 'Merchant solutions growth.' },
      ],
    },
  ];

  const { buyHoldCandidates, sellCandidates } = buildShortlists(episodes, 30);

  const shopCand = buyHoldCandidates.find((c) => c.ticker === 'SHOP');
  assert.ok(shopCand, 'SHOP should qualify as multi-analyst buy convergence');
  assert.equal(shopCand.buyCount, 3, 'SHOP has 3 buys');
  assert.equal(shopCand.distinctBuyGuests, 3, 'SHOP has 3 distinct buy analysts');
  assert.equal(shopCand.sellCount, 0, 'SHOP has 0 sells');

  const mrkCand = buyHoldCandidates.find((c) => c.ticker === 'MRK');
  assert.ok(mrkCand, 'MRK should qualify via official top pick + analyst confirmation');
  assert.equal(mrkCand.pickCount, 1, 'MRK has 1 top pick');
  assert.equal(mrkCand.distinctGuestCount, 2, 'MRK has 2 distinct analysts');
  assert.equal(mrkCand.sellCount, 0, 'MRK has 0 sells');
});

test('buildLLMEyesPrompt specifies buy conviction requirement and restricts allowed tickers', () => {
  const buyHoldCandidates = [
    {
      ticker: 'SHOP',
      company: 'Shopify',
      weightedScore: 3.5,
      mentionCount: 3,
      distinctGuestCount: 3,
      buyCount: 3,
      holdCount: 0,
      sellCount: 0,
      mentions: [
        { mentionType: 'pick', stance: 'buy', guest: 'Bruce Murray', date: '2026-10-02', reasoning: 'Strong margins.' },
      ],
    },
  ];
  const sellCandidates = [
    {
      ticker: 'LULU',
      company: 'Lululemon',
      weightedScore: -1.0,
      mentionCount: 1,
      distinctGuestCount: 1,
      buyCount: 0,
      holdCount: 0,
      sellCount: 1,
      mentions: [
        { mentionType: 'caller_mention', stance: 'sell', guest: 'Colin Szynski', date: '2026-09-29', reasoning: 'Inventory glut.' },
      ],
    },
  ];

  const { prompt, allowedTickers } = buildLLMEyesPrompt({ buyHoldCandidates, sellCandidates }, 7);

  assert.deepEqual(allowedTickers, ['SHOP', 'LULU']);
  assert.ok(prompt.includes('BUY CONVERGENCE CANDIDATES'), 'Prompt header reflects buy convergence');
  assert.ok(prompt.includes('Every Golden Pick MUST have genuine BUY conviction'), 'Prompt enforces buy requirement');
  assert.ok(prompt.includes('NEVER select a stock with 0 buy ratings or conflicting sell ratings'), 'Prompt forbids 0-buy / dissenting tickers');
});
