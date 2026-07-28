import { processReminders, currentSydneyHour } from './_reminder-service.js';

export async function cronReminderHandler(req, res) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  const supplied = String(req.headers.authorization || '');
  if (!expected || supplied !== `Bearer ${expected}`) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORISED_CRON' });
  }
  if (currentSydneyHour() !== 17) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'NOT_5PM_SYDNEY' });
  }
  const result = await processReminders({});
  return res.status(200).json({ ok: true, ...result });
}
