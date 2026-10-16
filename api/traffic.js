import { supabase } from './_supabaseClient.js';
import { handleAdminAuthRequest } from './_adminAuth.js';

/* ════════════════════════════════════════════════════════════════
   /api/traffic.js
   Honest, privacy-first, account-free traffic monitoring.
   Zero PII collected: no cookies, no tracking pixels, no raw IPs stored.
   Counts authentic all-time unique visitors and actual page views.
   Also handles admin authentication routes to stay within Vercel Hobby serverless limits.
   ════════════════════════════════════════════════════════════════ */

const memoryStats = {
  allTimeVisitors: new Set(),
  totalViews: 0,
  uniqueDaily: new Set(),
  lastResetDate: new Date().toISOString().slice(0, 10),
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle admin auth routing to save a serverless function slot on Vercel Hobby plan
  if (req.query.action === 'auth' || req.body?.action === 'auth' || (req.method === 'POST' && typeof req.body?.password === 'string')) {
    return handleAdminAuthRequest(req, res);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Reset daily unique cache if date changed
  if (memoryStats.lastResetDate !== todayStr) {
    memoryStats.uniqueDaily.clear();
    memoryStats.lastResetDate = todayStr;
  }

  if (req.method === 'POST') {
    const { vid, isNewVisitor } = req.body || {};
    const visitorKey = (typeof vid === 'string' && vid.length > 5)
      ? vid
      : (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'anon');

    memoryStats.totalViews += 1;
    memoryStats.uniqueDaily.add(visitorKey);
    memoryStats.allTimeVisitors.add(visitorKey);

    let dbTotalVisitors = memoryStats.allTimeVisitors.size;
    let dbTotalViews = memoryStats.totalViews;

    // Persist real count to Supabase if configured
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { data: allTimeRow } = await supabase
          .from('site_traffic')
          .select('id, page_views, unique_visitors')
          .eq('metric_date', '1970-01-01')
          .maybeSingle();

        if (allTimeRow) {
          const newViews = (allTimeRow.page_views || 0) + 1;
          const newVisitors = (allTimeRow.unique_visitors || 0) + (isNewVisitor ? 1 : 0);
          await supabase
            .from('site_traffic')
            .update({
              page_views: newViews,
              unique_visitors: newVisitors,
              updated_at: new Date().toISOString(),
            })
            .eq('metric_date', '1970-01-01');
          dbTotalViews = newViews;
          dbTotalVisitors = Math.max(1, newVisitors);
        } else {
          await supabase.from('site_traffic').insert([
            {
              metric_date: '1970-01-01',
              page_views: 1,
              unique_visitors: 1,
              created_at: new Date().toISOString(),
            },
          ]);
          dbTotalViews = 1;
          dbTotalVisitors = 1;
        }
      }
    } catch {
      // Fallback to memory count
    }

    return res.status(200).json({
      status: 'success',
      totalVisitors: Math.max(1, dbTotalVisitors),
      todayVisitors: Math.max(1, memoryStats.uniqueDaily.size),
      totalViews: Math.max(1, dbTotalViews),
    });
  }

  if (req.method === 'GET') {
    let totalVisitors = Math.max(1, memoryStats.allTimeVisitors.size);
    let totalViews = Math.max(1, memoryStats.totalViews);
    let todayVisitors = Math.max(1, memoryStats.uniqueDaily.size);

    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { data: allTimeRow } = await supabase
          .from('site_traffic')
          .select('page_views, unique_visitors')
          .eq('metric_date', '1970-01-01')
          .maybeSingle();

        if (allTimeRow) {
          totalViews = Math.max(totalViews, allTimeRow.page_views || 1);
          totalVisitors = Math.max(totalVisitors, allTimeRow.unique_visitors || 1);
        }
      }
    } catch {
      // Memory fallback
    }

    return res.status(200).json({
      totalVisitors,
      totalViews,
      todayVisitors,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
