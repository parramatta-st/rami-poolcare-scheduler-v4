import { authenticationConfigured, clearSessionCookie, isAuthenticated, setSessionCookie, verifyPin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: authenticationConfigured(),
      authenticated: isAuthenticated(req)
    });
  }

  if (req.method === 'POST') {
    if (!authenticationConfigured()) {
      return res.status(503).json({ ok: false, error: 'APP_LOGIN_NOT_CONFIGURED' });
    }
    if (!verifyPin(req.body?.pin)) {
      return res.status(401).json({ ok: false, error: 'INCORRECT_PIN' });
    }
    setSessionCookie(res);
    return res.status(200).json({ ok: true, authenticated: true });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true, authenticated: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
}
