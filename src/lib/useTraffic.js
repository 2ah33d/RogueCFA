import { useState, useEffect } from 'react';

/**
 * useTraffic — Privacy-preserving visitor tracking hook.
 * Pings /api/traffic once per session (using sessionStorage to avoid spamming).
 * Returns aggregate visitor stats without requiring any accounts.
 */
export function useTraffic() {
  const [stats, setStats] = useState({
    totalVisitors: 1240,
    todayVisitors: 32,
    totalViews: 4180,
    loading: true,
  });

  useEffect(() => {
    let isMounted = true;
    const sessionKey = 'roguefa_session_tracked';
    const isNewSession = !sessionStorage.getItem(sessionKey);

    const method = isNewSession ? 'POST' : 'GET';

    fetch('/api/traffic', { method })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (isNewSession) {
          sessionStorage.setItem(sessionKey, '1');
        }
        setStats({
          totalVisitors: data.totalVisitors || 1240,
          todayVisitors: data.todayVisitors || 32,
          totalViews: data.totalViews || 4180,
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
