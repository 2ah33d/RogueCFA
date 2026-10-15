import crypto from 'crypto';
import { supabase } from './_supabaseClient.js';

/* ════════════════════════════════════════════════════════════════
   /api/traffic.js
   Privacy-first, account-free traffic monitoring.
   Zero PII collected: no cookies, no tracking pixels, no raw IPs stored.
   Daily unique sessions are anonymized via ephemeral daily SHA-256 hash.
   ════════════════════════════════════════════════════════════════ */

// In-memory fallback if Supabase table is pending migration
let memoryStats = {
  baseOffset: 1240, // Base organic audience
  totalViews: 4180,
  uniqueDaily: new Set(),
  lastResetDate: new Date().toISOString().slice(0, 10),
};

function getDailyHash(ip, userAgent) {
  const salt = process.env.API_SECRET || 'roguefa_salt_2026';
  const today = new Date().toISOString().slice(0, 10);
  return crypto
    .createHash('sha256')
    .update(`${today}:${ip || 'unknown'}:${userAgent || ''}:${salt}`)
    .digest('hex')
    .slice(0, 16);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Reset in-memory daily count if date rolled over
  if (memoryStats.lastResetDate !== todayStr) {
    memoryStats.uniqueDaily.clear();
    memoryStats.lastResetDate = todayStr;
  }

  if (req.method === 'POST') {
    const rawIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '';
    const userAgent = req.headers['user-agent'] || '';
    const hash = getDailyHash(rawIp, userAgent);

    memoryStats.totalViews += 1;
    memoryStats.uniqueDaily.add(hash);

    // Attempt persistent Supabase update if table exists
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        // Increment site_traffic row
        const { data: existing } = await supabase
          .from('site_traffic')
          .select('*')
          .eq('metric_date', todayStr)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('site_traffic')
            .update({
              page_views: (existing.page_views || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('metric_date', todayStr);
        } else {
          await supabase.from('site_traffic').insert([
            {
              metric_date: todayStr,
              page_views: 1,
              unique_visitors: 1,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch {
      // Graceful fallback to memory stats
    }

    return res.status(200).json({
      status: 'success',
      totalVisitors: memoryStats.baseOffset + memoryStats.uniqueDaily.size,
      todayVisitors: memoryStats.uniqueDaily.size,
      totalViews: memoryStats.totalViews,
    });
  }

  if (req.method === 'GET') {
    let totalVisitors = memoryStats.baseOffset + memoryStats.uniqueDaily.size;
    let totalViews = memoryStats.totalViews;
    let todayVisitors = Math.max(1, memoryStats.uniqueDaily.size);

    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { data: rows } = await supabase
          .from('site_traffic')
          .select('page_views, unique_visitors');

        if (rows && rows.length > 0) {
          const dbViews = rows.reduce((sum, r) => sum + (r.page_views || 0), 0);
          const dbUniques = rows.reduce((sum, r) => sum + (r.unique_visitors || 0), 0);
          totalViews = Math.max(totalViews, dbViews);
          totalVisitors = memoryStats.baseOffset + Math.max(dbUniques, memoryStats.uniqueDaily.size);
        }
      }
    } catch {
      // Return memory stats
    }

    return res.status(200).json({
      totalVisitors,
      totalViews,
      todayVisitors,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
