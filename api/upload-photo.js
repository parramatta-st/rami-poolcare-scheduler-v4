import { requireAuth } from './_auth.js';
import { apiError, getGoogleAccessToken, getGoogleConfig } from './_google.js';

function safeName(value) {
  return String(value || 'pool-photo').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pool-photo';
}

export const config = {
  api: { bodyParser: { sizeLimit: '6mb' } }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const dataUrl = String(req.body?.dataUrl || '');
    const contactId = safeName(req.body?.contactId || 'contact');
    const contactName = safeName(req.body?.contactName || 'customer');
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ ok: false, error: 'INVALID_IMAGE' });
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'IMAGE_TOO_LARGE' });
    }

    const { driveFolderId } = getGoogleConfig();
    const token = await getGoogleAccessToken();
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${contactId}-${contactName}-${Date.now()}.${extension}`;
    const metadata = {
      name: filename,
      parents: [driveFolderId],
      description: `Uploaded from Rami Pool Care for ${req.body?.contactName || contactId}`
    };
    const boundary = `rami_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,createdTime', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result?.error?.message || 'Google Drive upload failed.');
      error.response = { status: response.status, data: result };
      throw error;
    }
    return res.status(200).json({
      ok: true,
      file: {
        id: result.id,
        name: result.name,
        mimeType: result.mimeType,
        src: `/api/photo?fileId=${encodeURIComponent(result.id)}`
      }
    });
  } catch (error) {
    return apiError(res, error);
  }
}
