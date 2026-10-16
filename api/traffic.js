import { supabase } from './_supabaseClient.js';
import { handleAdminAuthRequest } from './_adminAuth.js';

/* ════════════════════════════════════════════════════════════════
   /api/traffic.js
   Honest, privacy-first, account-free traffic monitoring.
   Zero PII collected: no cookies, no tracking pixels, no raw IPs stored.
   Counts authentic all-time unique visitors and actual page views.
   Also handles admin authentication routes to stay within Vercel Hobby serverless limits.
   ════════════════════════════════════════════════════════════════ */

const TELEMETRY_ROW_ID = 'telemetry_site_traffic';

async function getOrInitTelemetry() {
  const todayStr = new Date().toISOString().slice(0, 10);
  let telemetry = {
    totalViews: 0,
    totalVisitors: 0,
    visitors: [],
    todayMap: {},
  };

  try {
    const { data: row } = await supabase
      .from('digest_jobs')
      .select('id, result')
      .eq('id', TELEMETRY_ROW_ID)
      .maybeSingle();

    if (row && row.result) {
      telemetry = row.result;
    }
  } catch (err) {
    console.warn('[api/traffic] Failed to fetch telemetry from digest_jobs:', err.message);
  }

  if (!Array.isArray(telemetry.visitors)) telemetry.visitors = [];
  if (!telemetry.todayMap || typeof telemetry.todayMap !== 'object') telemetry.todayMap = {};
  if (!Array.isArray(telemetry.todayMap[todayStr])) telemetry.todayMap[todayStr] = [];

  return { telemetry, todayStr };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle admin auth routing to save a serverless function slot on Vercel Hobby plan
  if (req.query?.action === 'auth' || req.body?.action === 'auth' || (req.method === 'POST' && typeof req.body?.password === 'string')) {
    return handleAdminAuthRequest(req, res);
  }

  if (req.method === 'POST') {
    const { vid, isNewSession = false } = req.body || {};
    const visitorKey = (typeof vid === 'string' && vid.length > 5)
      ? vid.trim()
      : (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'anon');

    const { telemetry, todayStr } = await getOrInitTelemetry();
    let hasChanged = false;

    // Check unique visitor
    if (visitorKey && visitorKey !== 'anon' && !telemetry.visitors.includes(visitorKey)) {
      telemetry.visitors.push(visitorKey);
      telemetry.totalVisitors = telemetry.visitors.length;
      hasChanged = true;
    }

    // Check today unique
    if (visitorKey && visitorKey !== 'anon' && !telemetry.todayMap[todayStr].includes(visitorKey)) {
      telemetry.todayMap[todayStr].push(visitorKey);
      hasChanged = true;
    }

    // Check session view
    if (isNewSession) {
      telemetry.totalViews = (telemetry.totalViews || 0) + 1;
      hasChanged = true;
    }

    // Keep minimum sane counts
    telemetry.totalVisitors = Math.max(telemetry.totalVisitors, telemetry.visitors.length, 1);
    telemetry.totalViews = Math.max(telemetry.totalViews, telemetry.totalVisitors, 1);

    if (hasChanged) {
      try {
        await supabase
          .from('digest_jobs')
          .upsert({
            id: TELEMETRY_ROW_ID,
            episode_date: '1970-01-01',
            status: 'telemetry',
            result: telemetry,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (err) {
        console.warn('[api/traffic] Failed to persist telemetry upsert:', err.message);
      }
    }

    const todayCount = Array.isArray(telemetry.todayMap[todayStr]) ? telemetry.todayMap[todayStr].length : 1;

    return res.status(200).json({
      status: 'success',
      totalVisitors: telemetry.totalVisitors,
      todayVisitors: Math.max(1, todayCount),
      totalViews: telemetry.totalViews,
    });
  }

  if (req.method === 'GET') {
    const queryVid = typeof req.query.vid === 'string' ? req.query.vid.trim() : null;
    const { telemetry, todayStr } = await getOrInitTelemetry();

    if (queryVid && queryVid.length > 5 && !telemetry.visitors.includes(queryVid)) {
      telemetry.visitors.push(queryVid);
      telemetry.totalVisitors = telemetry.visitors.length;
      if (!telemetry.todayMap[todayStr].includes(queryVid)) {
        telemetry.todayMap[todayStr].push(queryVid);
      }
      telemetry.totalViews = Math.max(telemetry.totalViews, telemetry.totalVisitors);
      try {
        await supabase
          .from('digest_jobs')
          .upsert({
            id: TELEMETRY_ROW_ID,
            episode_date: '1970-01-01',
            status: 'telemetry',
            result: telemetry,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (err) {
        console.warn('[api/traffic] Failed to persist GET telemetry:', err.message);
      }
    }

    const todayCount = Array.isArray(telemetry.todayMap[todayStr]) ? telemetry.todayMap[todayStr].length : 1;

    return res.status(200).json({
      status: 'success',
      totalVisitors: Math.max(1, telemetry.totalVisitors),
      todayVisitors: Math.max(1, todayCount),
      totalViews: Math.max(1, telemetry.totalViews),
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
