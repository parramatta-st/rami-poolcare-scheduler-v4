import { requireAuth } from './_auth.js';
import { apiError, getGoogleAccessToken } from './_google.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=300');
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const fileId = String(req.query.fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    return res.status(400).json({ ok: false, error: 'INVALID_FILE_ID' });
  }
  try {
    const token = await getGoogleAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Could not load photo: ${text.slice(0, 200)}`);
      error.response = { status: response.status, data: { error: { message: error.message } } };
      throw error;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Content-Length', String(bytes.length));
    return res.status(200).send(bytes);
  } catch (error) {
    return apiError(res, error);
  }
}
