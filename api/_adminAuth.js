import crypto from 'crypto';

/* ════════════════════════════════════════════════════════════════
   api/_adminAuth.js (Private helper module — not a serverless function)
   Secure backend admin authentication.
   Validates strictly against ADMIN_PASSWORD or API_SECRET from environment.
   ════════════════════════════════════════════════════════════════ */

export function getAdminSecret() {
  return process.env.ADMIN_PASSWORD || process.env.API_SECRET || 'roguefa_admin_default_key';
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const [role, expStr] = payload.split(':');
  if (role !== 'admin') return false;

  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Date.now() > exp) return false;

  const secret = getAdminSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return signature === expectedSignature;
}

export async function handleAdminAuthRequest(req, res) {
  // GET: Verify existing token or check if admin is configured
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isValid = verifyAdminToken(token);

    return res.status(200).json({
      authenticated: isValid,
      configured: Boolean(process.env.ADMIN_PASSWORD || process.env.API_SECRET),
    });
  }

  // POST: Sign in with password
  if (req.method === 'POST') {
    const { password } = req.body || {};
    const configuredPassword = process.env.ADMIN_PASSWORD || process.env.API_SECRET;

    if (!configuredPassword) {
      return res.status(500).json({
        error: 'ADMIN_PASSWORD is not configured in .env.local or environment variables.',
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required.' });
    }

    if (password.trim() !== configuredPassword.trim()) {
      return res.status(401).json({ error: 'Incorrect admin password.' });
    }

    // Generate 7-day HMAC signed session token
    const secret = getAdminSecret();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const payload = `admin:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = `${payload}.${signature}`;

    return res.status(200).json({
      success: true,
      token,
      expiresAt,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
