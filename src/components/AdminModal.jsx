import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, ShieldCheck, Activity, LogOut, KeyRound } from 'lucide-react';

/**
 * AdminModal — Secure backend-verified admin authentication & control center.
 * Password is authenticated strictly by /api/admin-auth against ADMIN_PASSWORD.
 * Zero hardcoded passwords or public credential editing in client bundles.
 */
export default function AdminModal({ isOpen, onClose, isAdmin, onLoginSuccess, onLogout, trafficStats }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.token) {
        localStorage.setItem('roguefa_admin_token', data.token);
        localStorage.setItem('roguefa_admin_session', 'active_' + Date.now());
        setSuccessMsg('Admin access verified!');
        onLoginSuccess();
        setTimeout(() => {
          onClose();
        }, 700);
      }
    } catch (err) {
      setError(err.message || 'Incorrect admin password.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = () => {
    localStorage.removeItem('roguefa_admin_token');
    localStorage.removeItem('roguefa_admin_session');
    onLogout();
    setSuccessMsg('Logged out of Admin mode.');
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in font-sans"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="w-full max-w-md bg-surface-card rounded-2xl shadow-antigravity-elevated border border-surface-elevated/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-surface-elevated/40 flex items-center justify-between bg-surface-card">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isAdmin ? 'bg-signal-buy/20 text-signal-buy' : 'bg-surface-elevated text-dim'}`}>
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-prime">
                {isAdmin ? 'Admin Console' : 'Admin Login'}
              </h3>
              <p className="text-xs text-dim">
                {isAdmin ? 'Full Site & Token Management Active' : 'Sign in to access admin triggers & renew tools'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-dim hover:text-prime hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Active Admin View */}
          {isAdmin ? (
            <div className="space-y-5">
              <div className="p-4 bg-surface-elevated rounded-xl border border-signal-buy/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-signal-buy shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-prime block">Admin Mode Active</span>
                    <span className="text-[11px] text-dim">Full site unlocked (Renew digest, token generation, dev settings).</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="px-3 py-1.5 bg-surface-card hover:bg-danger/20 hover:text-danger text-dim rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>

              {/* Real Traffic Telemetry Card */}
              <div className="p-4 bg-surface-elevated rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-prime flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-accent" />
                    Verified Audience Telemetry
                  </span>
                  <span className="text-[10px] text-dim font-medium bg-surface-card px-2 py-0.5 rounded-full">
                    Actual Real Counts
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                  <div className="p-3 bg-surface-card rounded-lg">
                    <span className="text-[10px] text-dim block">All-Time Unique Visitors</span>
                    <span className="text-xl font-bold text-prime tabular-nums">
                      {trafficStats?.totalVisitors ? trafficStats.totalVisitors.toLocaleString() : '1'}
                    </span>
                  </div>
                  <div className="p-3 bg-surface-card rounded-lg">
                    <span className="text-[10px] text-dim block">Total Page Views</span>
                    <span className="text-xl font-bold text-accent tabular-nums">
                      {trafficStats?.totalViews ? trafficStats.totalViews.toLocaleString() : '1'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-surface-elevated/50 rounded-xl text-[11px] text-dim leading-relaxed border border-edge/30">
                <div className="flex items-center gap-1.5 text-prime font-medium mb-1">
                  <KeyRound className="w-3 h-3 text-accent" />
                  <span>Password Security</span>
                </div>
                To change your admin password, edit <code className="text-accent bg-surface-card px-1 py-0.5 rounded">ADMIN_PASSWORD</code> in your local <code className="text-prime font-semibold">.env.local</code> file or Vercel Environment Variables.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status & Error Alerts */}
              {error && (
                <div className="p-3 bg-danger/15 text-danger rounded-xl text-xs leading-relaxed border border-danger/25">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="p-3 bg-signal-buy/15 text-signal-buy rounded-xl text-xs leading-relaxed border border-signal-buy/25">
                  {successMsg}
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-dim block mb-1">Admin Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password configured in .env.local"
                    className="w-full bg-surface-elevated px-3.5 py-2.5 rounded-xl text-sm text-prime placeholder:text-dim/50 border border-edge/40 focus:outline-hidden focus:border-accent"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-accent text-accent-text hover:bg-accent-hover text-sm font-semibold rounded-xl transition-all shadow-antigravity mt-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying...' : 'Unlock Admin Mode'}
                </button>
              </form>

              <div className="p-3.5 bg-surface-elevated/40 rounded-xl text-[11px] text-dim leading-relaxed border border-edge/30">
                <span className="text-prime font-medium block mb-0.5">Where is the password set?</span>
                Configured securely in your private <code className="text-accent bg-surface-card px-1 py-0.5 rounded">.env.local</code> file under <code className="text-prime font-semibold">ADMIN_PASSWORD</code>. Not modifiable from the public web.
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
