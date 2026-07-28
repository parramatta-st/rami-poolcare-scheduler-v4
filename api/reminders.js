import { requireAuth } from './_auth.js';
import { apiError } from './_google.js';
import { processReminders } from './_reminder-service.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const result = await processReminders({
      appointmentIds: Array.isArray(req.body?.appointmentIds) ? req.body.appointmentIds : [],
      scheduledDate: String(req.body?.scheduledDate || ''),
      previewOnly: Boolean(req.body?.previewOnly)
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return apiError(res, error);
  }
}
