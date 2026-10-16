import { useState, useEffect } from 'react';

/**
 * useTraffic — Privacy-preserving visitor tracking hook.
 * Counts all-time unique visitors using anonymous local client ID.
 * Zero PII, zero cookies, no accounts.
 */
export function useTraffic() {
  const [stats, setStats] = useState({
    totalVisitors: 1,
    todayVisitors: 1,
    totalViews: 1,
    loading: true,
  });

  useEffect(() => {
    let isMounted = true;

    // Persistent anonymous visitor ID
    let vid = null;
    let isNewVisitor = false;
    try {
      vid = localStorage.getItem('roguefa_vid');
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
        localStorage.setItem('roguefa_vid', vid);
        isNewVisitor = true;
      }
    } catch {
      vid = 'anon';
    }

    // Session tracking so page reloads don't duplicate views within the same session
    const sessionKey = 'roguefa_session_tracked';
    let isNewSession = false;
    try {
      isNewSession = !sessionStorage.getItem(sessionKey);
    } catch {
      isNewSession = true;
    }

    const method = isNewSession ? 'POST' : 'GET';
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (isNewSession) {
      options.body = JSON.stringify({ vid, isNewVisitor });
    }

    fetch('/api/traffic', options)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (isNewSession) {
          try {
            sessionStorage.setItem(sessionKey, '1');
          } catch {
            /* ignore */
          }
        }
        setStats({
          totalVisitors: data.totalVisitors ?? 1,
          todayVisitors: data.todayVisitors ?? 1,
          totalViews: data.totalViews ?? 1,
          loading: false,
        });
      })
      .catch(() => {
        if (isMounted) {
          setStats((prev) => ({ ...prev, loading: false }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return stats;
}
