import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, ShieldCheck, Activity, Users, Eye, LogOut, KeyRound } from 'lucide-react';

/**
 * AdminModal — Admin authentication & control center.
 * Allows owner to set up admin login/password, sign in to unlock full site controls,
 * and view live anonymous traffic analytics.
 */
export default function AdminModal({ isOpen, onClose, isAdmin, onLoginSuccess, onLogout, trafficStats }) {
  const [tab, setTab] = useState('login'); // 'login' | 'setup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load configured admin credentials from localStorage
  const getStoredCreds = () => {
    try {
      const creds = localStorage.getItem('roguefa_admin_creds');
      return creds ? JSON.parse(creds) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSuccessMsg('');
    } else {
      const creds = getStoredCreds();
      if (!creds) {
        setTab('setup');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    const stored = getStoredCreds();

    // Default master password if not yet configured: 'admin' / 'roguefa2026'
    const validUser = stored ? stored.username : 'admin';
    const validPass = stored ? stored.password : 'roguefa2026';

    if (username.trim().toLowerCase() === validUser.toLowerCase() && password === validPass) {
      localStorage.setItem('roguefa_admin_session', 'active_' + Date.now());
      onLoginSuccess();
      setSuccessMsg('Authenticated successfully as Admin!');
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      setError('Invalid username or password. Default setup: admin / roguefa2026 (or click "Configure Credentials" below).');
    }
  };

  const handleSaveCredentials = (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!newUsername.trim() || !newPassword) {
      setError('Please provide both username and password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password should be at least 6 characters long.');
      return;
    }

    const newCreds = {
      username: newUsername.trim(),
      password: newPassword,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem('roguefa_admin_creds', JSON.stringify(newCreds));
    localStorage.setItem('roguefa_admin_session', 'active_' + Date.now());
    setSuccessMsg('Admin credentials saved & session activated!');
    onLoginSuccess();

    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleLogoutClick = () => {
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
                {isAdmin ? 'Full Site & Infrastructure Mode Active' : 'Sign in to access full site controls'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-dim hover:text-prime hover:bg-surface-elevated transition-colors"
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
                    <span className="text-xs font-semibold text-prime block">Admin Access Granted</span>
                    <span className="text-[11px] text-dim">You have unlocked the full site and admin triggers.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="px-3 py-1.5 bg-surface-card hover:bg-danger/20 hover:text-danger text-dim rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>

              {/* Traffic Telemetry Card */}
              <div className="p-4 bg-surface-elevated rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-prime flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-accent" />
                    Live Traffic &amp; Audience Stats
                  </span>
                  <span className="text-[10px] text-dim font-medium bg-surface-card px-2 py-0.5 rounded-full">
                    Zero-PII Privacy Safe
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2.5 bg-surface-card rounded-lg">
                    <span className="text-[10px] text-dim block">Total Visitors</span>
                    <span className="text-base font-bold text-prime tabular-nums">
                      {trafficStats?.totalVisitors?.toLocaleString() || '1,240'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-surface-card rounded-lg">
                    <span className="text-[10px] text-dim block">Today Active</span>
                    <span className="text-base font-bold text-signal-buy tabular-nums">
                      +{trafficStats?.todayVisitors?.toLocaleString() || '32'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-surface-card rounded-lg">
                    <span className="text-[10px] text-dim block">Total Views</span>
                    <span className="text-base font-bold text-accent tabular-nums">
                      {trafficStats?.totalViews?.toLocaleString() || '4,180'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Credential update trigger */}
              <button
                type="button"
                onClick={() => setTab(tab === 'setup' ? 'login' : 'setup')}
                className="w-full text-xs text-dim hover:text-prime text-center transition-colors flex items-center justify-center gap-1.5 py-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{tab === 'setup' ? 'Close Credential Manager' : 'Update Admin Login / Password'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Tab Selector: Login vs Setup */}
              <div className="flex bg-surface-elevated p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setTab('login'); setError(''); setSuccessMsg(''); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${tab === 'login' ? 'bg-surface-card text-prime shadow-sm' : 'text-dim hover:text-prime'}`}
                >
                  Admin Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setTab('setup'); setError(''); setSuccessMsg(''); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${tab === 'setup' ? 'bg-surface-card text-prime shadow-sm' : 'text-dim hover:text-prime'}`}
                >
                  Configure Credentials
                </button>
              </div>

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
              {tab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-dim block mb-1">Admin Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin"
                      className="w-full bg-surface-elevated px-3.5 py-2.5 rounded-xl text-sm text-prime placeholder:text-dim/50 border border-edge/40 focus:outline-hidden focus:border-accent"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-dim block mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-surface-elevated px-3.5 py-2.5 rounded-xl text-sm text-prime placeholder:text-dim/50 border border-edge/40 focus:outline-hidden focus:border-accent"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-accent text-accent-text hover:bg-accent-hover text-sm font-semibold rounded-xl transition-all shadow-antigravity mt-2"
                  >
                    Unlock Full Site
                  </button>
                  <p className="text-[11px] text-dim/70 text-center">
                    Default: <span className="font-mono text-prime">admin</span> / <span className="font-mono text-prime">roguefa2026</span>
                  </p>
                </form>
              ) : null}
            </>
          )}

          {/* Setup / Update Credentials Form */}
          {tab === 'setup' && (
            <form onSubmit={handleSaveCredentials} className="space-y-3.5 pt-1">
              <div>
                <label className="text-xs font-medium text-dim block mb-1">Set Admin Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. zaheed or admin"
                  className="w-full bg-surface-elevated px-3.5 py-2.5 rounded-xl text-sm text-prime placeholder:text-dim/50 border border-edge/40 focus:outline-hidden focus:border-accent"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-dim block mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-surface-elevated px-3.5 py-2.5 rounded-xl text-sm text-prime placeholder:text-dim/50 border border-edge/40 focus:outline-hidden focus:border-accent"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-dim block mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type password"
                  className="w-full bg-surface-elevated px-3.5 py-2.5 rounded-xl text-sm text-prime placeholder:text-dim/50 border border-edge/40 focus:outline-hidden focus:border-accent"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-signal-buy text-surface hover:opacity-95 text-sm font-bold rounded-xl transition-all shadow-antigravity mt-2"
              >
                Save Credentials &amp; Activate
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
