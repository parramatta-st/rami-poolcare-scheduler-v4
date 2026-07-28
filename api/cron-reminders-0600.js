import { apiError } from './_google.js';
import { cronReminderHandler } from './_cron-reminders.js';
export default async function handler(req, res) {
  try { return await cronReminderHandler(req, res); }
  catch (error) { return apiError(res, error); }
}
