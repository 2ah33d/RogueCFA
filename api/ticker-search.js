import { supabase } from './_supabaseClient.js';

/**
 * Common Canadian & US blue-chip colloquial aliases and tickers.
 * Enables searching "RBC" -> RY, "Scotiabank" -> BNS, "Google" -> GOOGL, etc.
 */
const STOCK_SYNONYMS = {
  // Canadian Big 6 Banks
  'RBC': ['RY', 'ROYAL BANK', 'ROYAL BANK OF CANADA'],
  'RY': ['RBC', 'ROYAL BANK', 'ROYAL BANK OF CANADA'],
  'ROYAL BANK': ['RY', 'RBC', 'ROYAL BANK OF CANADA'],
  'ROYAL BANK OF CANADA': ['RY', 'RBC'],
  'TD': ['TD BANK', 'TORONTO DOMINION', 'TORONTO-DOMINION'],
  'TD BANK': ['TD', 'TORONTO DOMINION', 'TORONTO-DOMINION'],
  'TORONTO DOMINION': ['TD', 'TD BANK'],
  'BMO': ['BANK OF MONTREAL'],
  'BANK OF MONTREAL': ['BMO'],
  'BNS': ['SCOTIABANK', 'SCOTIA', 'BANK OF NOVA SCOTIA'],
  'SCOTIABANK': ['BNS', 'SCOTIA', 'BANK OF NOVA SCOTIA'],
  'SCOTIA': ['BNS', 'SCOTIABANK', 'BANK OF NOVA SCOTIA'],
  'CM': ['CIBC', 'CANADIAN IMPERIAL BANK OF COMMERCE'],
  'CIBC': ['CM', 'CANADIAN IMPERIAL BANK OF COMMERCE'],
  'NA': ['NATIONAL BANK', 'NATIONAL BANK OF CANADA'],
  'NATIONAL BANK': ['NA', 'NATIONAL BANK OF CANADA'],

  // Canadian Railways
  'CNR': ['CN RAIL', 'CANADIAN NATIONAL', 'CANADIAN NATIONAL RAILWAY'],
  'CN RAIL': ['CNR', 'CANADIAN NATIONAL'],
  'CP': ['CP RAIL', 'CANADIAN PACIFIC', 'CPKC', 'CANADIAN PACIFIC KANSAS CITY'],
  'CP RAIL': ['CP', 'CANADIAN PACIFIC', 'CPKC'],
  'CPKC': ['CP', 'CANADIAN PACIFIC', 'CP RAIL'],

  // Canadian Energy & Pipelines
  'ENB': ['ENBRIDGE'],
  'ENBRIDGE': ['ENB'],
  'TRP': ['TC ENERGY', 'TRANSCANADA'],
  'TC ENERGY': ['TRP', 'TRANSCANADA'],
  'SU': ['SUNCOR', 'SUNCOR ENERGY'],
  'SUNCOR': ['SU', 'SUNCOR ENERGY'],
  'CNQ': ['CANADIAN NATURAL', 'CANADIAN NATURAL RESOURCES'],
  'CANADIAN NATURAL': ['CNQ'],
  'CVE': ['CENOVUS', 'CENOVUS ENERGY'],
  'CENOVUS': ['CVE'],
  'TOU': ['TOURMALINE', 'TOURMALINE OIL'],
  'TOURMALINE': ['TOU'],
  'WCP': ['WHITECAP', 'WHITECAP RESOURCES'],
  'WHITECAP': ['WCP'],
  'ARX': ['ARC RESOURCES'],
  'ARC RESOURCES': ['ARX'],
  'PPL': ['PEMBINA', 'PEMBINA PIPELINE'],
  'PEMBINA': ['PPL'],
  'KEY': ['KEYERA'],
  'KEYERA': ['KEY'],
  'IMO': ['IMPERIAL OIL'],
  'IMPERIAL OIL': ['IMO'],
  'PKI': ['PARKLAND'],

  // Canadian Telecom
  'T': ['TELUS'],
  'TELUS': ['T'],
  'BCE': ['BELL', 'BELL CANADA'],
  'BELL': ['BCE', 'BELL CANADA'],
  'RCI': ['ROGERS', 'ROGERS COMMUNICATIONS', 'RCI.B'],
  'RCI.B': ['ROGERS', 'ROGERS COMMUNICATIONS', 'RCI'],
  'ROGERS': ['RCI.B', 'RCI', 'ROGERS COMMUNICATIONS'],

  // Canadian Tech
  'SHOP': ['SHOPIFY'],
  'SHOPIFY': ['SHOP'],
  'CSU': ['CONSTELLATION', 'CONSTELLATION SOFTWARE'],
  'CONSTELLATION SOFTWARE': ['CSU'],
  'GIB.A': ['CGI', 'CGI GROUP', 'GIB'],
  'CGI': ['GIB.A', 'GIB', 'CGI GROUP'],
  'OTEX': ['OPEN TEXT', 'OPENTEXT'],
  'OPEN TEXT': ['OTEX', 'OPENTEXT'],
  'DSG': ['DESCARTES', 'DESCARTES SYSTEMS'],
  'LSPD': ['LIGHTSPEED'],

  // Canadian Utilities & Infrastructure
  'FTS': ['FORTIS'],
  'FORTIS': ['FTS'],
  'EMA': ['EMERA'],
  'EMERA': ['EMA'],
  'AQN': ['ALGONQUIN', 'ALGONQUIN POWER'],
  'CPX': ['CAPITAL POWER'],
  'CAPITAL POWER': ['CPX'],
  'TA': ['TRANSALTA'],
  'WSP': ['WSP GLOBAL'],
  'WSP GLOBAL': ['WSP'],
  'STN': ['STANTEC'],

  // Canadian Retail & Consumer
  'ATD': ['COUCHE-TARD', 'ALIMENTATION COUCHE-TARD', 'CIRCLE K'],
  'COUCHE-TARD': ['ATD', 'ALIMENTATION COUCHE-TARD', 'CIRCLE K'],
  'DOL': ['DOLLARAMA'],
  'DOLLARAMA': ['DOL'],
  'L': ['LOBLAWS', 'LOBLAW'],
  'LOBLAWS': ['L', 'LOBLAW'],
  'WN': ['GEORGE WESTON', 'WESTON'],
  'MRU': ['METRO'],
  'CTC.A': ['CANADIAN TIRE', 'CTC'],
  'CANADIAN TIRE': ['CTC.A', 'CTC'],
  'MG': ['MAGNA', 'MAGNA INTERNATIONAL'],
  'MAGNA': ['MG'],
  'QSR': ['RESTAURANT BRANDS', 'TIM HORTONS', 'BURGER KING'],
  'TIM HORTONS': ['QSR', 'RESTAURANT BRANDS'],
  'BYD': ['BOYD', 'BOYD GROUP'],

  // Canadian Materials & Mining
  'ABX': ['BARRICK', 'BARRICK GOLD', 'GOLD'],
  'BARRICK': ['ABX', 'BARRICK GOLD', 'GOLD'],
  'AEM': ['AGNICO', 'AGNICO EAGLE'],
  'AGNICO': ['AEM', 'AGNICO EAGLE'],
  'WPM': ['WHEATON', 'WHEATON PRECIOUS METALS'],
  'FNV': ['FRANCO-NEVADA'],
  'TECK.B': ['TECK', 'TECK RESOURCES'],
  'TECK': ['TECK.B', 'TECK RESOURCES'],
  'IVN': ['IVANHOE', 'IVANHOE MINES'],
  'CCO': ['CAMECO', 'CCJ'],
  'CAMECO': ['CCO', 'CCJ'],
  'NTR': ['NUTRIEN', 'AGRIUM', 'POTASH'],
  'NUTRIEN': ['NTR'],
  'FM': ['FIRST QUANTUM'],
  'LUN': ['LUNDIN', 'LUNDIN MINING'],
  'CS': ['CAPSTONE COPPER'],

  // Canadian Financials / Asset Managers / Insurers
  'BN': ['BROOKFIELD', 'BROOKFIELD CORP', 'BAM'],
  'BAM': ['BROOKFIELD ASSET MANAGEMENT', 'BROOKFIELD', 'BN'],
  'BROOKFIELD': ['BN', 'BAM'],
  'MFC': ['MANULIFE', 'MANULIFE FINANCIAL'],
  'MANULIFE': ['MFC'],
  'SLF': ['SUN LIFE', 'SUN LIFE FINANCIAL'],
  'SUN LIFE': ['SLF'],
  'GWO': ['GREAT-WEST LIFECO', 'GREAT WEST LIFE'],
  'POW': ['POWER CORP', 'POWER CORPORATION'],
  'IFC': ['INTACT', 'INTACT FINANCIAL'],
  'TRI': ['THOMSON REUTERS'],

  // US Mega-Caps
  'AAPL': ['APPLE'],
  'APPLE': ['AAPL'],
  'MSFT': ['MICROSOFT'],
  'MICROSOFT': ['MSFT'],
  'GOOGL': ['GOOGLE', 'ALPHABET', 'GOOG'],
  'GOOG': ['GOOGLE', 'ALPHABET', 'GOOGL'],
  'GOOGLE': ['GOOGL', 'GOOG', 'ALPHABET'],
  'ALPHABET': ['GOOGL', 'GOOG', 'GOOGLE'],
  'AMZN': ['AMAZON'],
  'AMAZON': ['AMZN'],
  'NVDA': ['NVIDIA'],
  'NVIDIA': ['NVDA'],
  'META': ['FACEBOOK'],
  'FACEBOOK': ['META'],
  'TSLA': ['TESLA'],
  'TESLA': ['TSLA'],
  'BRK.B': ['BERKSHIRE', 'BERKSHIRE HATHAWAY', 'WARREN BUFFETT'],
  'BERKSHIRE': ['BRK.B', 'BRK.A', 'BERKSHIRE HATHAWAY'],
  'UBER': ['UBER TECHNOLOGIES'],
};

/**
 * Check if text contains word, enforcing word boundaries for short strings (<= 3 chars)
 * to prevent false positives like "RY" matching inside "Stryker".
 */
function containsWord(text, word) {
  if (!text || !word) return false;
  const str = String(text);
  if (word.length <= 3) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^a-zA-Z0-9])' + escaped + '(?:$|[^a-zA-Z0-9])', 'i').test(str);
  }
  return str.toLowerCase().includes(word.toLowerCase());
}

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
    const cleanQNoDot = cleanQ.replace('.TO', '').replace('.TSX', '').replace('.V', '');
    const searchTerms = cleanQ.split(/\s+/).filter(Boolean);

    // Expand search terms with colloquial stock synonyms / aliases
    const synonymSet = new Set([cleanQ, cleanQNoDot]);
    if (STOCK_SYNONYMS[cleanQ]) {
      for (const s of STOCK_SYNONYMS[cleanQ]) synonymSet.add(s.toUpperCase());
    }
    if (STOCK_SYNONYMS[cleanQNoDot]) {
      for (const s of STOCK_SYNONYMS[cleanQNoDot]) synonymSet.add(s.toUpperCase());
    }
    const synonyms = Array.from(synonymSet);

    const allMentions = [];

    for (const row of dbRows || []) {
      const digest = row.result?.digest;
      if (!digest) continue;

      const guest = digest.guest || 'MarketCall Analyst';
      const guestUpper = guest.toUpperCase();
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
        const tickerNoDot = ticker.replace('.TO', '').replace('.TSX', '').replace('.V', '');
        const company = (m.company || m.companyName || m.company_name || ticker).trim();
        const companyUpper = company.toUpperCase();
        const reasoning = (m.reasoning || m.summary || m.thesis || m.commentary || '').trim();
        const reasoningUpper = reasoning.toUpperCase();

        let matches = false;
        let priority = 99;
        let matchedField = null;

        // 1. Exact Ticker or Synonym Ticker match (e.g. searching "RY" or "RBC" matching ticker "RY")
        for (const syn of synonyms) {
          if (ticker === syn || tickerNoDot === syn) {
            matches = true;
            priority = 1;
            matchedField = 'ticker';
            break;
          }
        }

        // 2. Exact Company or Synonym Company match
        if (!matches) {
          for (const syn of synonyms) {
            if (companyUpper === syn || (syn.length > 2 && companyUpper.includes(syn))) {
              matches = true;
              priority = syn === cleanQ ? 2 : 2.5;
              matchedField = 'company';
              break;
            }
          }
        }

        // 3. Ticker Prefix Match (e.g. "UB" matching "UBER")
        if (!matches && cleanQ.length >= 2) {
          if (ticker.startsWith(cleanQ) || tickerNoDot.startsWith(cleanQNoDot)) {
            matches = true;
            priority = 3;
            matchedField = 'ticker';
          }
        }

        // 4. Company Name contains word or phrase
        if (!matches && containsWord(company, cleanQ)) {
          matches = true;
          priority = 4;
          matchedField = 'company';
        }

        // 5. Guest Analyst Name Match (e.g. "Caldwell", "Zechner", "Nuttall")
        if (!matches && (containsWord(guest, cleanQ) || guestUpper.includes(cleanQ))) {
          matches = true;
          priority = 5;
          matchedField = 'guest';
        }

        // 6. Commentary / Reasoning exact phrase match (e.g. "dividend", "interest rates", "oil", "copper", "uranium")
        if (!matches && containsWord(reasoning, cleanQ)) {
          matches = true;
          priority = 6;
          matchedField = 'reasoning';
        }

        // 7. Multi-word search: all terms appear somewhere across [ticker, company, guest, reasoning, segment]
        if (!matches && searchTerms.length > 1) {
          const combinedDoc = `${ticker} ${tickerNoDot} ${companyUpper} ${guestUpper} ${m.segment.toUpperCase()} ${reasoningUpper}`;
          const allTermsPresent = searchTerms.every((term) => {
            // Check if term or any of its synonyms is in the document
            const termSyns = STOCK_SYNONYMS[term] || [];
            return combinedDoc.includes(term) || termSyns.some((ts) => combinedDoc.includes(ts.toUpperCase()));
          });

          if (allTermsPresent) {
            matches = true;
            priority = 7;
            matchedField = 'multi_term';
          }
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
            reasoning: reasoning || 'Mentioned during MarketCall broadcast.',
            videoId: m.videoId,
            videoTitle: m.videoTitle,
            priority,
            matchedField,
          });
        }
      }
    }

    /* Sort results: first by relevance priority, then chronologically */
    allMentions.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
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
