import { getGoogleConfig, googleRequest } from './_google.js';

export const CONTACT_HEADERS = [
  'ContactID', 'Status', 'Name', 'Mobile', 'Email', 'Address', 'Suburb',
  'Latitude', 'Longitude', 'LastVisit', 'NextVisit', 'Active', 'CreatedAt',
  'UpdatedAt', 'LeadStage', 'Service', 'Callback', 'StreetKey', 'Postcode',
  'DefaultRepeatWeeks', 'SMSRemindersEnabled', 'PreferredDay', 'Paused'
];

export const TIMELINE_HEADERS = [
  'TimelineID', 'ContactID', 'EntryType', 'Text', 'PhotoFileID', 'PhotoURL', 'CreatedAt'
];

export const APPOINTMENT_HEADERS = [
  'AppointmentID', 'ContactID', 'ScheduledDate', 'VisitType', 'Status',
  'RepeatWeeks', 'AreaLabel', 'RouteOrder', 'ReminderEnabled', 'ReminderStatus',
  'ReminderSentAt', 'ReminderProviderID', 'CreatedAt', 'UpdatedAt'
];

export const ROUTE_HEADERS = [
  'RouteID', 'RouteType', 'CreatedAt', 'StartLatitude', 'StartLongitude',
  'EndLatitude', 'EndLongitude', 'ScheduledDate', 'ContactID', 'AppointmentID',
  'StopOrder', 'Status', 'CompletedAt', 'Phase'
];

export const SETTINGS_HEADERS = ['Setting', 'Value'];

const REQUIRED_SHEETS = [
  'Contacts', 'Timeline', 'Appointments', 'Routes', 'Settings', 'ImportedEmails', 'Visits'
];

function encodeRange(value) {
  return encodeURIComponent(value).replace(/%21/g, '!');
}

export async function ensureRequiredSheets() {
  const { spreadsheetId } = getGoogleConfig();
  const metadata = await googleRequest({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    method: 'GET'
  });
  const existing = new Set((metadata.sheets || []).map(item => item?.properties?.title).filter(Boolean));
  const missing = REQUIRED_SHEETS.filter(title => !existing.has(title));
  if (!missing.length) return;
  await googleRequest({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: 'POST',
    data: { requests: missing.map(title => ({ addSheet: { properties: { title } } })) }
  });
}

export async function readRanges(ranges) {
  const { spreadsheetId } = getGoogleConfig();
  const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&');
  return googleRequest({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}`,
    method: 'GET'
  });
}

export async function overwriteSheet(sheetName, headers, rows) {
  const { spreadsheetId } = getGoogleConfig();
  const clearRange = `${sheetName}!A:AZ`;
  await googleRequest({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    method: 'POST',
    data: { ranges: [clearRange] }
  });
  const allRows = [headers, ...rows];
  await googleRequest({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeRange(`${sheetName}!A1`)}?valueInputOption=RAW`,
    method: 'PUT',
    data: {
      range: `${sheetName}!A1`,
      majorDimension: 'ROWS',
      values: allRows
    }
  });
}

export function valuesToObjects(values = []) {
  if (!values.length) return [];
  const headers = values[0].map(value => String(value || '').trim());
  return values.slice(1).filter(row => row.some(value => String(value || '').trim())).map(row => {
    const object = {};
    headers.forEach((header, index) => { if (header) object[header] = row[index] ?? ''; });
    return object;
  });
}
