import {
  APPOINTMENT_HEADERS,
  ensureRequiredSheets,
  overwriteSheet,
  readRanges,
  valuesToObjects
} from './_sheets.js';

function dateInSydney(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(item => item.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function currentSydneyHour() {
  return Number(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', hour: '2-digit', hourCycle: 'h23'
  }).format(new Date()));
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function normaliseAustralianMobile(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 9 && digits.startsWith('4')) return `+61${digits}`;
  return '';
}

export function buildReminderMessage(contact) {
  return `Hi ${firstName(contact?.Name)},\n\nJust a quick note to let you know I’ll be by tomorrow to service your pool. Please ensure the side gate is unlocked so I can access the pool area.\n\nThank you, and I’ll see you tomorrow.\n\nRegards,\nRami Narse\nJim’s Pool Care Parramatta`;
}

function appointmentRows(objects) {
  return objects.map(row => APPOINTMENT_HEADERS.map(header => row[header] ?? ''));
}

async function sendTwilioMessage({ to, body }) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || '').trim();
  const messagingServiceSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    const error = new Error('SMS provider is not configured yet.');
    error.code = 'SMS_NOT_CONFIGURED';
    throw error;
  }

  const form = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  else form.set('From', from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || 'Twilio could not send the message.');
    error.code = result.code || 'TWILIO_ERROR';
    throw error;
  }
  return result;
}

export async function processReminders({ appointmentIds = [], scheduledDate = '', previewOnly = false } = {}) {
  await ensureRequiredSheets();
  const data = await readRanges(['Contacts!A:W', 'Appointments!A:N']);
  const contacts = valuesToObjects(data.valueRanges?.[0]?.values || []);
  const appointments = valuesToObjects(data.valueRanges?.[1]?.values || []);
  const byId = new Map(contacts.map(item => [item.ContactID, item]));
  const idSet = new Set(appointmentIds.filter(Boolean));
  const targetDate = scheduledDate || dateInSydney(1);

  const candidates = appointments.filter(item => {
    const status = String(item.Status || '').toLowerCase();
    const reminderStatus = String(item.ReminderStatus || '').toLowerCase();
    const enabled = !/^(no|false|0)$/i.test(String(item.ReminderEnabled || 'Yes'));
    const selected = idSet.size ? idSet.has(item.AppointmentID) : item.ScheduledDate === targetDate;
    return selected && enabled && ['scheduled', 'confirmed'].includes(status) && reminderStatus !== 'sent';
  });

  const previews = candidates.map(item => {
    const contact = byId.get(item.ContactID) || {};
    return {
      appointmentId: item.AppointmentID,
      contactId: item.ContactID,
      name: contact.Name || 'Unknown',
      mobile: contact.Mobile || '',
      to: normaliseAustralianMobile(contact.Mobile),
      message: buildReminderMessage(contact),
      scheduledDate: item.ScheduledDate
    };
  });

  const configured = Boolean(
    String(process.env.TWILIO_ACCOUNT_SID || '').trim() &&
    String(process.env.TWILIO_AUTH_TOKEN || '').trim() &&
    (String(process.env.TWILIO_FROM_NUMBER || '').trim() || String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim())
  );
  if (previewOnly || !configured) return { configured, targetDate, previews, sent: [], failed: [] };

  const sent = [];
  const failed = [];
  for (const preview of previews) {
    const row = appointments.find(item => item.AppointmentID === preview.appointmentId);
    if (!preview.to) {
      failed.push({ ...preview, error: 'INVALID_MOBILE' });
      if (row) row.ReminderStatus = 'Needs Review';
      continue;
    }
    try {
      const result = await sendTwilioMessage({ to: preview.to, body: preview.message });
      const sentAt = new Date().toISOString();
      if (row) {
        row.ReminderStatus = 'Sent';
        row.ReminderSentAt = sentAt;
        row.ReminderProviderID = result.sid || '';
        row.UpdatedAt = sentAt;
      }
      sent.push({ ...preview, providerId: result.sid || '', sentAt });
    } catch (error) {
      failed.push({ ...preview, error: error.code || 'SEND_FAILED', message: error.message });
      if (row) {
        row.ReminderStatus = 'Failed';
        row.UpdatedAt = new Date().toISOString();
      }
    }
  }
  await overwriteSheet('Appointments', APPOINTMENT_HEADERS, appointmentRows(appointments));
  return { configured, targetDate, previews, sent, failed };
}
