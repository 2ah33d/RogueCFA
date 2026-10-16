import { useState, useEffect, useCallback } from 'react';

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

  const getVid = useCallback(() => {
    try {
      let vid = localStorage.getItem('roguefa_vid');
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        localStorage.setItem('roguefa_vid', vid);
      }
      return vid;
    } catch {
      return 'anon';
    }
  }, []);

  const pingServer = useCallback((isNewSession = false) => {
    const vid = getVid();
    return fetch('/api/traffic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vid, isNewSession }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setStats({
          totalVisitors: data.totalVisitors ?? 1,
          todayVisitors: data.todayVisitors ?? 1,
          totalViews: data.totalViews ?? 1,
          loading: false,
        });
      })
      .catch(() => {
        setStats((prev) => ({ ...prev, loading: false }));
      });
  }, [getVid]);

  useEffect(() => {
    const sessionKey = 'roguefa_session_tracked';
    let isNewSession = false;
    try {
      isNewSession = !sessionStorage.getItem(sessionKey);
      if (isNewSession) {
        sessionStorage.setItem(sessionKey, '1');
      }
    } catch {
      isNewSession = true;
    }

    // Initial ping on mount
    pingServer(isNewSession);

    // Re-check traffic when window regains focus (e.g. switching back from friend's chat)
    const onFocus = () => {
      pingServer(false);
    };
    window.addEventListener('focus', onFocus);

    // Periodic poll every 45s while active
    const interval = setInterval(() => {
      pingServer(false);
    }, 45000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [pingServer]);

  return {
    ...stats,
    refresh: () => pingServer(false),
  };
}
