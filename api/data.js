import { requireAuth } from './_auth.js';
import { apiError } from './_google.js';
import {
  APPOINTMENT_HEADERS,
  CONTACT_HEADERS,
  ROUTE_HEADERS,
  SETTINGS_HEADERS,
  TIMELINE_HEADERS,
  ensureRequiredSheets,
  overwriteSheet,
  readRanges,
  valuesToObjects
} from './_sheets.js';

function statusFromRecord(record) {
  if (record.category === 'member') return 'Member';
  if (record.category === 'one_time') return 'One-Time Job';
  if (record.category === 'past') return 'Past Customer';
  if (record.category === 'contact') return 'Saved Contact';
  if (record.category === 'not_proceeding') return 'Not Proceeding';
  return 'Lead';
}

function categoryFromStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'member') return 'member';
  if (value.includes('one-time')) return 'one_time';
  if (value === 'past customer') return 'past';
  if (value === 'saved contact') return 'contact';
  if (value === 'not proceeding') return 'not_proceeding';
  return 'lead';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function yesNo(value, fallback = true) {
  if (value === '' || value == null) return fallback;
  return !/^(no|false|0)$/i.test(String(value).trim());
}

function routeRows(db) {
  const routes = [...(db.routeHistory || [])];
  if (db.activeRoute) routes.unshift(db.activeRoute);
  const rows = [];
  routes.forEach(route => {
    (route.stops || []).forEach((stop, index) => {
      rows.push([
        route.id || '', route.type || '', route.createdAt || '',
        route.start?.lat ?? '', route.start?.lng ?? '', route.end?.lat ?? '', route.end?.lng ?? '',
        route.scheduledDate || '', stop.recordId || '', stop.appointmentId || '', index + 1,
        stop.status || 'pending', route.completedAt || route.endedAt || '', route.phase || ''
      ]);
    });
  });
  return rows;
}

function serialize(db) {
  const now = new Date().toISOString();
  const contacts = [];
  const timeline = [];
  const appointments = [];

  (db.records || []).forEach(record => {
    contacts.push([
      record.id || '', statusFromRecord(record), record.name || '', record.mobile || '',
      record.email || '', record.address || '', record.suburb || '', record.lat ?? '', record.lng ?? '',
      record.lastVisit || '', record.nextVisit || '', record.category === 'not_proceeding' ? 'No' : 'Yes',
      record.createdAt || now, now, record.leadStage || '', record.service || '', record.callback || '',
      record.streetKey || '', record.postcode || '', record.defaultRepeatWeeks ?? '',
      record.smsRemindersEnabled === false ? 'No' : 'Yes', record.preferredDay || '', record.paused ? 'Yes' : 'No'
    ]);

    (record.timeline || []).forEach(entry => {
      const photos = Array.isArray(entry.photos) ? entry.photos : [];
      if (!photos.length) {
        timeline.push([entry.id || '', record.id || '', entry.type || 'message', entry.text || '', '', '', entry.createdAt || now]);
        return;
      }
      photos.forEach((photo, photoIndex) => {
        const fileId = typeof photo === 'object' ? photo.fileId || '' : '';
        const src = typeof photo === 'object' ? photo.src || '' : String(photo || '');
        timeline.push([
          photoIndex === 0 ? entry.id || '' : `${entry.id || 'TL'}-${photoIndex + 1}`,
          record.id || '', entry.type || 'message', photoIndex === 0 ? entry.text || '' : '',
          fileId, src, entry.createdAt || now
        ]);
      });
    });
  });

  (db.appointments || []).forEach(item => {
    appointments.push([
      item.id || '', item.contactId || '', item.scheduledDate || '', item.visitType || '',
      item.status || 'Scheduled', item.repeatWeeks ?? '', item.areaLabel || '', item.routeOrder ?? '',
      item.reminderEnabled === false ? 'No' : 'Yes', item.reminderStatus || 'Pending',
      item.reminderSentAt || '', item.reminderProviderId || '', item.createdAt || now, item.updatedAt || now
    ]);
  });

  const settings = Object.entries(db.settings || {}).map(([key, value]) => [key, value == null ? '' : String(value)]);
  return { contacts, timeline, appointments, routes: routeRows(db), settings };
}

function deserialize(contactValues, timelineValues, appointmentValues, routeValues, settingValues) {
  const contactObjects = valuesToObjects(contactValues);
  const timelineObjects = valuesToObjects(timelineValues);
  const appointmentObjects = valuesToObjects(appointmentValues);
  const settingObjects = valuesToObjects(settingValues);

  const records = contactObjects.map(row => ({
    id: row.ContactID,
    category: categoryFromStatus(row.Status),
    leadStage: row.LeadStage || (String(row.Status || '').toLowerCase() === 'lead' ? 'new' : ''),
    name: row.Name || 'Unnamed contact', mobile: row.Mobile || '', email: row.Email || '',
    address: row.Address || '', suburb: row.Suburb || '', postcode: row.Postcode || '',
    lat: numberOrNull(row.Latitude), lng: numberOrNull(row.Longitude), streetKey: row.StreetKey || '',
    service: row.Service || '', callback: row.Callback || '', createdAt: row.CreatedAt || new Date().toISOString(),
    lastVisit: row.LastVisit || '', nextVisit: row.NextVisit || '',
    defaultRepeatWeeks: Number(row.DefaultRepeatWeeks) || (String(row.Status || '').toLowerCase() === 'member' ? 4 : 0),
    smsRemindersEnabled: yesNo(row.SMSRemindersEnabled, true), preferredDay: row.PreferredDay || '',
    paused: yesNo(row.Paused, false), timeline: []
  })).filter(record => record.id);

  const byId = new Map(records.map(record => [record.id, record]));
  timelineObjects.forEach(row => {
    const record = byId.get(row.ContactID);
    if (!record) return;
    let entry = record.timeline.find(item => item.id === row.TimelineID);
    if (!entry) {
      entry = { id: row.TimelineID || `TL-${Date.now()}-${Math.random()}`, type: row.EntryType || 'message', text: row.Text || '', createdAt: row.CreatedAt || new Date().toISOString(), photos: [] };
      record.timeline.push(entry);
    }
    if (row.PhotoFileID || row.PhotoURL) {
      const fileId = row.PhotoFileID || '';
      entry.photos.push({ fileId, src: fileId ? `/api/photo?fileId=${encodeURIComponent(fileId)}` : row.PhotoURL });
    }
  });

  const appointments = appointmentObjects.map(row => ({
    id: row.AppointmentID, contactId: row.ContactID, scheduledDate: row.ScheduledDate || '',
    visitType: row.VisitType || 'Member Service', status: row.Status || 'Scheduled',
    repeatWeeks: Number(row.RepeatWeeks) || 0, areaLabel: row.AreaLabel || '',
    routeOrder: Number(row.RouteOrder) || null, reminderEnabled: yesNo(row.ReminderEnabled, true),
    reminderStatus: row.ReminderStatus || 'Pending', reminderSentAt: row.ReminderSentAt || '',
    reminderProviderId: row.ReminderProviderID || '', createdAt: row.CreatedAt || new Date().toISOString(),
    updatedAt: row.UpdatedAt || row.CreatedAt || new Date().toISOString()
  })).filter(item => item.id && item.contactId);

  const routeObjects = valuesToObjects(routeValues);
  const routeMap = new Map();
  routeObjects.forEach(row => {
    if (!row.RouteID) return;
    if (!routeMap.has(row.RouteID)) {
      routeMap.set(row.RouteID, {
        id: row.RouteID, type: row.RouteType || 'schedule', createdAt: row.CreatedAt || '',
        scheduledDate: row.ScheduledDate || '',
        start: { lat: numberOrNull(row.StartLatitude), lng: numberOrNull(row.StartLongitude), label: 'Saved route start' },
        currentLocation: { lat: numberOrNull(row.StartLatitude), lng: numberOrNull(row.StartLongitude) },
        end: { lat: numberOrNull(row.EndLatitude), lng: numberOrNull(row.EndLongitude), label: 'Home' },
        stops: [], completedAt: row.CompletedAt || '', phase: row.Phase || 'visits'
      });
    }
    routeMap.get(row.RouteID).stops.push({
      recordId: row.ContactID, appointmentId: row.AppointmentID || '', status: row.Status || 'pending',
      order: Number(row.StopOrder) || 9999
    });
  });
  const allRoutes = [...routeMap.values()].map(route => {
    route.stops.sort((a, b) => a.order - b.order);
    route.stops.forEach(stop => delete stop.order);
    return route;
  });
  const activeRoute = allRoutes.find(route => !route.completedAt && (route.phase === 'return_home' || route.stops.some(stop => stop.status === 'pending'))) || null;
  const routeHistory = allRoutes.filter(route => route !== activeRoute);
  const settings = {};
  settingObjects.forEach(row => { if (row.Setting) settings[row.Setting] = row.Value; });
  return { version: 4, records, appointments, routeHistory, activeRoute, settings };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  try {
    await ensureRequiredSheets();
    if (req.method === 'GET') {
      const data = await readRanges(['Contacts!A:W', 'Timeline!A:G', 'Appointments!A:N', 'Routes!A:N', 'Settings!A:B']);
      const ranges = data.valueRanges || [];
      const db = deserialize(
        ranges[0]?.values || [], ranges[1]?.values || [], ranges[2]?.values || [],
        ranges[3]?.values || [], ranges[4]?.values || []
      );
      return res.status(200).json({ ok: true, db });
    }

    if (req.method === 'PUT') {
      const db = req.body?.db;
      if (!db || !Array.isArray(db.records)) return res.status(400).json({ ok: false, error: 'INVALID_DATABASE' });
      const values = serialize(db);
      await Promise.all([
        overwriteSheet('Contacts', CONTACT_HEADERS, values.contacts),
        overwriteSheet('Timeline', TIMELINE_HEADERS, values.timeline),
        overwriteSheet('Appointments', APPOINTMENT_HEADERS, values.appointments),
        overwriteSheet('Routes', ROUTE_HEADERS, values.routes),
        overwriteSheet('Settings', SETTINGS_HEADERS, values.settings)
      ]);
      return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return apiError(res, error);
  }
}
