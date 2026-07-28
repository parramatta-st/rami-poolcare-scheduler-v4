(() => {
  "use strict";

  const CONFIG = window.RAMI_APP_CONFIG || {};
  const STORAGE_KEY = "rami-pool-care-production-v4";
  const LEGACY_STORAGE_KEYS = ["rami-pool-care-production-v3"];
  const API_BASE = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
  const main = document.getElementById("mainContent");
  const backButton = document.getElementById("backButton");
  const bottomNav = document.getElementById("bottomNav");
  const subtitle = document.getElementById("screenSubtitle");
  const toast = document.getElementById("toast");
  const modalRoot = document.getElementById("modalRoot");
  const cameraInput = document.getElementById("cameraInput");
  const libraryInput = document.getElementById("libraryInput");
  const installButton = document.getElementById("installButton");

  const gallery = document.getElementById("gallery");
  const galleryImage = document.getElementById("galleryImage");
  const galleryCaption = document.getElementById("galleryCaption");
  const galleryCounter = document.getElementById("galleryCounter");
  const galleryClose = document.getElementById("galleryClose");
  const galleryPrev = document.getElementById("galleryPrev");
  const galleryNext = document.getElementById("galleryNext");

  let deferredInstallPrompt = null;
  let toastTimer = null;
  let pendingPhotoData = null;
  let pendingPhotoRecordId = null;
  let galleryTouchStartX = 0;
  let remoteSyncTimer = null;
  let remoteReady = false;
  let remoteSyncInFlight = false;
  let remoteSyncPending = false;
  let authenticated = false;

  const state = {
    screen: "home",
    previousScreen: null,
    detailId: null,
    queries: {
      leads: "",
      members: "",
      search: "",
      routes: ""
    },
    leadFilter: "active",
    memberFilter: "active",
    routeType: "member",
    manualRouteMode: false,
    routeSelections: new Set(),
    routeStart: null,
    activeRoute: null,
    detailReturnScreen: "home",
    scheduleWeekOffset: 0,
    selectedDate: dateOnly(),
    scheduleReturnScreen: "schedule",
    galleryPhotos: [],
    galleryIndex: 0
  };

  let db = loadDatabase();
  state.activeRoute = db.activeRoute || null;

  function uid(prefix = "ID") {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isoNow() { return new Date().toISOString(); }
  function dateOnly(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function addDays(dateString, days) {
    const d = dateString ? new Date(`${dateString}T12:00:00`) : new Date();
    d.setDate(d.getDate() + days);
    return dateOnly(d);
  }

  function demoImage(label, shadeA, shadeB) {
    const safe = String(label).replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${shadeA}"/><stop offset="1" stop-color="${shadeB}"/></linearGradient></defs>
      <rect width="1200" height="800" fill="url(#g)"/>
      <circle cx="240" cy="220" r="130" fill="rgba(255,255,255,.16)"/>
      <circle cx="920" cy="570" r="220" fill="rgba(255,255,255,.10)"/>
      <rect x="130" y="170" width="940" height="460" rx="70" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.48)" stroke-width="8"/>
      <text x="600" y="385" text-anchor="middle" font-family="Arial, sans-serif" font-size="74" font-weight="700" fill="white">${safe}</text>
      <text x="600" y="455" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,.9)">Prototype photo</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function seedDatabase() {
    if (CONFIG.mode === "production") return { version: 3, records: [], routeHistory: [], activeRoute: null };
    const today = dateOnly();
    return {
      version: 3,
      records: [
        {
          id: "LEAD-DEMO-1",
          category: "lead",
          leadStage: "new",
          name: "Amina Rahman",
          mobile: "0400 123 456",
          email: "amina@example.com",
          address: "3 Sample Court, Glenhaven NSW 2156",
          suburb: "Glenhaven",
          postcode: "2156",
          lat: -33.7006,
          lng: 151.0038,
          streetKey: "SAMPLE COURT GLENHAVEN",
          service: "Pool clean",
          callback: "Within 2 hours",
          createdAt: isoNow(),
          lastVisit: "",
          nextVisit: "",
          timeline: [
            { id: uid("TL"), type: "system", text: "Lead automatically received.", createdAt: isoNow(), photos: [] }
          ]
        },
        {
          id: "LEAD-DEMO-2",
          category: "lead",
          leadStage: "called",
          name: "Daniel Lee",
          mobile: "0400 222 555",
          email: "daniel@example.com",
          address: "18 Orchard Road, Castle Hill NSW 2154",
          suburb: "Castle Hill",
          postcode: "2154",
          lat: -33.7318,
          lng: 151.0025,
          streetKey: "ORCHARD ROAD CASTLE HILL",
          service: "Equipment check",
          callback: "Called today",
          createdAt: isoNow(),
          lastVisit: "",
          nextVisit: "",
          timeline: [
            { id: uid("TL"), type: "system", text: "Marked as called.", createdAt: isoNow(), photos: [] }
          ]
        },
        {
          id: "MEM-DEMO-1",
          category: "member",
          leadStage: "",
          name: "John Smith",
          mobile: "0400 333 444",
          email: "john@example.com",
          address: "24 Example Street, Baulkham Hills NSW 2153",
          suburb: "Baulkham Hills",
          postcode: "2153",
          lat: -33.7581,
          lng: 150.9929,
          streetKey: "EXAMPLE STREET BAULKHAM HILLS",
          service: "Regular pool service",
          callback: "",
          createdAt: isoNow(),
          lastVisit: addDays(today, -31),
          nextVisit: addDays(today, -3),
          timeline: [
            {
              id: uid("TL"),
              type: "message",
              text: "Small leak near the filter connection.",
              createdAt: new Date(Date.now() - 31 * 86400000).toISOString(),
              photos: [demoImage("Pump and filter", "#0ea5e9", "#0f766e")]
            },
            {
              id: uid("TL"),
              type: "message",
              text: "Connection replaced. Everything is running properly.",
              createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
              photos: [demoImage("Replacement fitting", "#22c55e", "#0f766e")]
            }
          ]
        },
        {
          id: "MEM-DEMO-2",
          category: "member",
          leadStage: "",
          name: "Sarah Jones",
          mobile: "0400 555 777",
          email: "sarah@example.com",
          address: "8 Sample Avenue, Northmead NSW 2152",
          suburb: "Northmead",
          postcode: "2152",
          lat: -33.7858,
          lng: 150.9987,
          streetKey: "SAMPLE AVENUE NORTHMEAD",
          service: "Regular pool service",
          callback: "",
          createdAt: isoNow(),
          lastVisit: addDays(today, -21),
          nextVisit: addDays(today, 7),
          timeline: [
            {
              id: uid("TL"),
              type: "message",
              text: "Pool looking good.",
              createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
              photos: [demoImage("Pool overview", "#38bdf8", "#1d4ed8")]
            }
          ]
        },
        {
          id: "JOB-DEMO-1",
          category: "one_time",
          leadStage: "booked",
          name: "Michael Tran",
          mobile: "0400 888 999",
          email: "michael@example.com",
          address: "11 Demo Lane, Westmead NSW 2145",
          suburb: "Westmead",
          postcode: "2145",
          lat: -33.8067,
          lng: 150.9875,
          streetKey: "DEMO LANE WESTMEAD",
          service: "One-time green pool clean",
          callback: "Booked",
          createdAt: isoNow(),
          lastVisit: "",
          nextVisit: "",
          timeline: [
            { id: uid("TL"), type: "system", text: "One-time job booked.", createdAt: isoNow(), photos: [] }
          ]
        },
        {
          id: "CONTACT-DEMO-1",
          category: "contact",
          leadStage: "",
          name: "Priya Kumar",
          mobile: "0400 456 789",
          email: "priya@example.com",
          address: "5 Test Place, Parramatta NSW 2150",
          suburb: "Parramatta",
          postcode: "2150",
          lat: -33.8150,
          lng: 151.0011,
          streetKey: "TEST PLACE PARRAMATTA",
          service: "",
          callback: "",
          createdAt: isoNow(),
          lastVisit: "",
          nextVisit: "",
          timeline: [
            { id: uid("TL"), type: "system", text: "Saved as a contact.", createdAt: isoNow(), photos: [] }
          ]
        }
      ],
      routeHistory: [],
      activeRoute: null
    };
  }

  function normaliseDatabase(value) {
    const data = value && typeof value === "object" ? value : seedDatabase();
    if (!Array.isArray(data.records)) data.records = [];
    if (!Array.isArray(data.appointments)) data.appointments = [];
    if (!Array.isArray(data.routeHistory)) data.routeHistory = [];
    if (!("activeRoute" in data)) data.activeRoute = null;
    if (!data.settings || typeof data.settings !== "object") data.settings = {};
    const defaults = {
      HomeAddress: "7 Weston St, Rosehill NSW 2142",
      HomeLatitude: String(CONFIG.defaultStartCoordinates?.lat ?? -33.82313),
      HomeLongitude: String(CONFIG.defaultStartCoordinates?.lng ?? 151.02078),
      ReminderSendTime: "17:00",
      ReminderTimezone: "Australia/Sydney",
      ReturnHomeAfterRoute: "Yes",
      NearbyLeadSearchDays: "14",
      SMSMessageTemplate: "Hi {firstName},\n\nJust a quick note to let you know I’ll be by tomorrow to service your pool. Please ensure the side gate is unlocked so I can access the pool area.\n\nThank you, and I’ll see you tomorrow.\n\nRegards,\nRami Narse\nJim’s Pool Care Parramatta"
    };
    data.settings = { ...defaults, ...data.settings };
    data.version = 4;
    data.records.forEach(record => {
      if (!Array.isArray(record.timeline)) record.timeline = [];
      if (!record.id) record.id = uid("REC");
      if (record.defaultRepeatWeeks == null || record.defaultRepeatWeeks === "") record.defaultRepeatWeeks = record.category === "member" ? 4 : 0;
      record.defaultRepeatWeeks = Number(record.defaultRepeatWeeks) || 0;
      if (record.smsRemindersEnabled == null) record.smsRemindersEnabled = true;
      if (record.paused == null) record.paused = false;
      if (!record.preferredDay) record.preferredDay = "";
    });
    data.appointments.forEach(item => {
      if (!item.id) item.id = uid("APT");
      if (!item.status) item.status = "Scheduled";
      if (!item.createdAt) item.createdAt = isoNow();
      if (!item.updatedAt) item.updatedAt = item.createdAt;
      if (item.reminderEnabled == null) item.reminderEnabled = true;
      if (!item.reminderStatus) item.reminderStatus = "Pending";
      item.repeatWeeks = Number(item.repeatWeeks) || 0;
    });
    data.records.forEach(record => {
      if (!["member", "one_time"].includes(record.category) || !record.nextVisit) return;
      const exists = data.appointments.some(item => item.contactId === record.id && item.scheduledDate === record.nextVisit && !["Cancelled", "Completed"].includes(item.status));
      if (!exists) {
        data.appointments.push({
          id: uid("APT"), contactId: record.id, scheduledDate: record.nextVisit,
          visitType: record.category === "member" ? "Member Service" : "One-Time Job",
          status: "Scheduled", repeatWeeks: record.category === "member" ? (record.defaultRepeatWeeks || 4) : 0,
          areaLabel: record.suburb || "", routeOrder: null, reminderEnabled: record.smsRemindersEnabled !== false,
          reminderStatus: "Pending", reminderSentAt: "", reminderProviderId: "", createdAt: isoNow(), updatedAt: isoNow()
        });
      }
    });
    if (data.activeRoute) {
      if (!data.activeRoute.phase) data.activeRoute.phase = "visits";
      if (!data.activeRoute.end) data.activeRoute.end = homeLocation(data);
      (data.activeRoute.stops || []).forEach(stop => { if (!stop.appointmentId) stop.appointmentId = ""; });
    }
    return data;
  }

  function loadDatabase() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normaliseDatabase(JSON.parse(raw));
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const migrated = normaliseDatabase(JSON.parse(legacyRaw));
        migrated.localUpdatedAt = migrated.localUpdatedAt || isoNow();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.warn("Could not load local data", error);
    }
    const seeded = seedDatabase();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)); } catch (error) { console.warn(error); }
    return seeded;
  }

  function saveDatabase() {
    try {
      db.activeRoute = state.activeRoute || null;
      db.localUpdatedAt = isoNow();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      if (remoteReady && authenticated) scheduleRemoteSync();
      return true;
    } catch (error) {
      console.error(error);
      showToast("Phone storage is full. Remove a few large photos before adding more.");
      return false;
    }
  }

  function setConnectionStatus(message, stateName = "") {
    subtitle.textContent = message;
    subtitle.dataset.connection = stateName;
  }

  function scheduleRemoteSync() {
    clearTimeout(remoteSyncTimer);
    remoteSyncTimer = setTimeout(syncDatabaseToServer, 650);
  }

  async function syncDatabaseToServer() {
    if (!remoteReady || !authenticated) return;
    if (remoteSyncInFlight) {
      remoteSyncPending = true;
      return;
    }
    remoteSyncInFlight = true;
    setConnectionStatus("Saving to Google…", "saving");
    try {
      const response = await fetch(`${API_BASE}/api/data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ db })
      });
      if (response.status === 401) {
        authenticated = false;
        remoteReady = false;
        return showLoginScreen("Your session expired. Enter the PIN again.");
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not save to Google.");
      db.remoteSyncedAt = result.savedAt || isoNow();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      setConnectionStatus("Saved to Google", "saved");
    } catch (error) {
      console.error(error);
      setConnectionStatus("Not saved — will retry", "error");
      showToast("Could not save to Google. Your phone still has a local copy.");
    } finally {
      remoteSyncInFlight = false;
      if (remoteSyncPending) {
        remoteSyncPending = false;
        scheduleRemoteSync();
      }
    }
  }

  async function loadRemoteDatabase() {
    setConnectionStatus("Loading Google Sheet…", "loading");
    const response = await fetch(`${API_BASE}/api/data`, { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) {
      authenticated = false;
      return showLoginScreen("Enter Rami's PIN to continue.");
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Could not load Google Sheet data.");
    const remoteDb = normaliseDatabase(result.db || { records: [], routeHistory: [], activeRoute: null });
    const localHasUnsyncedChanges = Boolean(db.localUpdatedAt && (!db.remoteSyncedAt || db.localUpdatedAt > db.remoteSyncedAt));
    db = localHasUnsyncedChanges ? mergeDatabases(remoteDb, db) : remoteDb;
    state.activeRoute = db.activeRoute || null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    remoteReady = true;
    setConnectionStatus(localHasUnsyncedChanges ? "Restoring unsaved phone changes…" : "Connected to Google", "connected");
    render();
    if (localHasUnsyncedChanges) scheduleRemoteSync();
  }


  function mergeDatabases(remoteDb, localDb) {
    const merged = normaliseDatabase(remoteDb);
    const records = new Map((merged.records || []).map(record => [record.id, record]));
    (localDb.records || []).forEach(localRecord => {
      const remoteRecord = records.get(localRecord.id);
      if (!remoteRecord) {
        records.set(localRecord.id, localRecord);
        return;
      }
      const timeline = new Map((remoteRecord.timeline || []).map(entry => [entry.id, entry]));
      (localRecord.timeline || []).forEach(entry => timeline.set(entry.id, entry));
      records.set(localRecord.id, { ...remoteRecord, ...localRecord, timeline: [...timeline.values()] });
    });
    merged.records = [...records.values()];
    const appointments = new Map((merged.appointments || []).map(item => [item.id, item]));
    (localDb.appointments || []).forEach(item => appointments.set(item.id, { ...(appointments.get(item.id) || {}), ...item }));
    merged.appointments = [...appointments.values()];
    merged.settings = { ...(merged.settings || {}), ...(localDb.settings || {}) };
    merged.routeHistory = localDb.routeHistory?.length ? localDb.routeHistory : merged.routeHistory;
    merged.activeRoute = localDb.activeRoute || merged.activeRoute;
    merged.localUpdatedAt = localDb.localUpdatedAt;
    merged.remoteSyncedAt = localDb.remoteSyncedAt;
    return normaliseDatabase(merged);
  }

  function showLoginScreen(message = "Enter the app PIN.") {
    bottomNav.classList.add("hidden");
    backButton.classList.add("hidden");
    setConnectionStatus("Secure sign-in", "locked");
    main.innerHTML = `
      <section class="login-card">
        <div class="login-icon">🔒</div>
        <h1>Rami Pool Care</h1>
        <p>${escapeHtml(message)}</p>
        <form id="pinLoginForm" class="login-form">
          <label for="appPin">PIN</label>
          <input id="appPin" name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required autofocus />
          <button class="primary-button button-block" type="submit">Open App</button>
          <div id="loginError" class="login-error" aria-live="polite"></div>
        </form>
      </section>`;
    document.getElementById("pinLoginForm")?.addEventListener("submit", submitPinLogin);
  }

  function showSetupProblem(message) {
    bottomNav.classList.add("hidden");
    backButton.classList.add("hidden");
    setConnectionStatus("Setup required", "error");
    main.innerHTML = `<section class="login-card"><div class="login-icon">⚙️</div><h1>One setup step remains</h1><p>${escapeHtml(message)}</p></section>`;
  }

  async function submitPinLogin(event) {
    event.preventDefault();
    const pin = String(new FormData(event.currentTarget).get("pin") || "");
    const errorBox = document.getElementById("loginError");
    if (errorBox) errorBox.textContent = "Checking…";
    const response = await fetch(`${API_BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ pin })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (errorBox) errorBox.textContent = result.error === "INCORRECT_PIN" ? "That PIN is not correct." : "Could not sign in.";
      return;
    }
    authenticated = true;
    bottomNav.classList.remove("hidden");
    await loadRemoteDatabase().catch(handleBootError);
  }

  function handleBootError(error) {
    console.error(error);
    remoteReady = false;
    setConnectionStatus("Google connection problem", "error");
    bottomNav.classList.remove("hidden");
    render();
    showToast(error.message || "Could not connect to Google. A local copy is available.");
  }

  async function boot() {
    try {
      const response = await fetch(`${API_BASE}/api/auth`, { credentials: "same-origin", cache: "no-store" });
      const auth = await response.json().catch(() => ({}));
      if (!auth.configured) return showSetupProblem("Add APP_ACCESS_PIN and APP_SESSION_SECRET in Vercel, then redeploy.");
      if (!auth.authenticated) return showLoginScreen("Enter Rami's PIN to continue.");
      authenticated = true;
      bottomNav.classList.remove("hidden");
      await loadRemoteDatabase();
    } catch (error) {
      handleBootError(error);
    }
  }

  function resetDatabase() {
    db = seedDatabase();
    state.activeRoute = null;
    db.activeRoute = null;
    saveDatabase();
    state.routeSelections.clear();
    state.routeStart = null;
    state.queries = { leads: "", members: "", search: "", routes: "" };
    navigate("home");
    showToast("Prototype reset.");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalisePhone(phone) { return String(phone || "").replace(/[^+\d]/g, ""); }
  function categoryLabel(record) {
    if (record.category === "member") return "Member";
    if (record.category === "one_time") return "One-time job";
    if (record.category === "past") return "Past customer";
    if (record.category === "contact") return "Saved contact";
    if (record.category === "not_proceeding") return "Not proceeding";
    if (record.category === "lead" && record.leadStage === "called") return "Called lead";
    return "New lead";
  }

  function badgeClass(record) {
    if (record.category === "member") return "badge-member";
    if (record.category === "one_time") return "badge-one-time";
    if (record.category === "past" || record.category === "not_proceeding") return "badge-past";
    if (record.category === "contact") return "badge-contact";
    if (record.leadStage === "called") return "badge-called";
    return "badge-new";
  }

  function isDue(record) {
    if (record.category !== "member") return false;
    if (!record.nextVisit) return true;
    return record.nextVisit <= dateOnly();
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "Not set";
    const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("en-AU", includeTime
      ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric" }
    ).format(d);
  }

  function findRecord(id) { return db.records.find(record => record.id === id); }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function navigate(screen, options = {}) {
    state.previousScreen = state.screen;
    state.screen = screen;
    if (options.detailId !== undefined) state.detailId = options.detailId;
    window.scrollTo({ top: 0, behavior: "auto" });
    render();
  }

  function render() {
    document.querySelectorAll(".nav-item").forEach(button => {
      const target = button.dataset.screen;
      button.classList.toggle("active", target === state.screen || (state.screen === "detail" && target === detailParentScreen()));
    });

    backButton.classList.toggle("hidden", !["detail", "search"].includes(state.screen));
    bottomNav.classList.toggle("hidden", false);

    switch (state.screen) {
      case "leads": renderLeads(); break;
      case "members": renderMembers(); break;
      case "routes": renderRoutes(); break;
      case "search": renderSearch(); break;
      case "detail": renderDetail(); break;
      default: renderHome();
    }

    if (!main.querySelector("input:focus, textarea:focus, select:focus")) {
      main.focus({ preventScroll: true });
    }
  }

  function detailParentScreen() {
    if (["home", "leads", "members", "search", "routes"].includes(state.detailReturnScreen)) {
      return state.detailReturnScreen;
    }
    const record = findRecord(state.detailId);
    return record && record.category === "member" ? "members" : "leads";
  }

  function openDetail(recordId) {
    state.detailReturnScreen = state.screen;
    navigate("detail", { detailId: recordId });
  }

  function renderHome() {
    subtitle.textContent = "Simple service organiser";
    const activeLeads = db.records.filter(r => r.category === "lead" || r.category === "one_time").length;
    const members = db.records.filter(r => r.category === "member").length;
    const due = db.records.filter(isDue).length;

    main.innerHTML = `
      <section class="hero-card">
        <h1>Everything Rami needs, in a few taps.</h1>
        <p>Call customers, open Google Maps, save photos and build simple routes.</p>
        <div class="hero-stat-row">
          <div class="hero-stat"><strong>${activeLeads}</strong><span>Active leads</span></div>
          <div class="hero-stat"><strong>${members}</strong><span>Members</span></div>
          <div class="hero-stat"><strong>${due}</strong><span>Due now</span></div>
        </div>
      </section>

      <div class="home-grid">
        <button class="big-tile full" data-action="go-routes" type="button">
          <span class="tile-icon">🗺️</span>
          <strong>Today's Route</strong>
          <span>Choose leads or members and start from the phone's location.</span>
          ${due ? `<span class="tile-badge">${due}</span>` : ""}
        </button>
        <button class="big-tile" data-action="go-leads" type="button">
          <span class="tile-icon">⚡</span>
          <strong>Leads</strong>
          <span>Call, navigate, book one-time work or make a member.</span>
        </button>
        <button class="big-tile" data-action="go-members" type="button">
          <span class="tile-icon">👤</span>
          <strong>Members</strong>
          <span>Photos, notes, contact details and regular routes.</span>
        </button>
        <button class="big-tile" data-action="go-search" type="button">
          <span class="tile-icon">🔎</span>
          <strong>Search</strong>
          <span>Find any lead, member, one-time customer or saved contact.</span>
        </button>
        <button class="big-tile" data-action="open-add-menu" type="button">
          <span class="tile-icon">＋</span>
          <strong>Add Someone</strong>
          <span>Manually add a lead, member or saved contact.</span>
        </button>
      </div>

      <div class="prototype-note">
        <strong>Google connected:</strong> contacts and notes save to the private Google Sheet. Photos save to the private Google Drive folder.
      </div>
    `;
  }

  function renderLeads() {
    subtitle.textContent = "Leads and one-time jobs";
    const query = state.queries.leads.trim().toLowerCase();
    let records = db.records.filter(record => ["lead", "one_time", "past", "not_proceeding"].includes(record.category));

    if (state.leadFilter === "active") records = records.filter(r => ["lead", "one_time"].includes(r.category));
    if (state.leadFilter === "new") records = records.filter(r => r.category === "lead" && r.leadStage !== "called");
    if (state.leadFilter === "called") records = records.filter(r => r.category === "lead" && r.leadStage === "called");
    if (state.leadFilter === "one_time") records = records.filter(r => r.category === "one_time");
    if (state.leadFilter === "past") records = records.filter(r => ["past", "not_proceeding"].includes(r.category));
    if (query) records = records.filter(r => recordSearchText(r).includes(query));

    main.innerHTML = `
      <h1 class="page-title">Leads</h1>
      <p class="page-intro">New enquiries and one-time jobs stay separate from regular members.</p>
      <div class="toolbar">
        <div class="search-box"><input id="leadSearch" value="${escapeHtml(state.queries.leads)}" placeholder="Search name, phone or address" /><span>🔎</span></div>
        <button class="add-fab" data-action="add-specific" data-category="lead" type="button" aria-label="Add lead">＋</button>
      </div>
      <div class="filter-row">
        ${filterChip("active", "Active", state.leadFilter)}
        ${filterChip("new", "New", state.leadFilter)}
        ${filterChip("called", "Called", state.leadFilter)}
        ${filterChip("one_time", "One-time", state.leadFilter)}
        ${filterChip("past", "Past", state.leadFilter)}
      </div>
      <div class="card-list">
        ${records.length ? records.map(contactCard).join("") : emptyState("⚡", "No matching leads", "New lead emails and manually added leads will appear here.")}
      </div>
    `;
  }

  function renderMembers() {
    subtitle.textContent = "Regular pool members";
    const query = state.queries.members.trim().toLowerCase();
    let records = db.records.filter(record => record.category === "member");
    if (state.memberFilter === "due") records = records.filter(isDue);
    if (state.memberFilter === "upcoming") records = records.filter(r => !isDue(r));
    if (query) records = records.filter(r => recordSearchText(r).includes(query));

    records.sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || a.name.localeCompare(b.name));

    main.innerHTML = `
      <h1 class="page-title">Members</h1>
      <p class="page-intro">Open a member to call, navigate, take photos or view previous notes.</p>
      <div class="toolbar">
        <div class="search-box"><input id="memberSearch" value="${escapeHtml(state.queries.members)}" placeholder="Search name, phone or address" /><span>🔎</span></div>
        <button class="add-fab" data-action="add-specific" data-category="member" type="button" aria-label="Add member">＋</button>
      </div>
      <div class="filter-row">
        ${filterChip("active", "All members", state.memberFilter)}
        ${filterChip("due", "Due now", state.memberFilter)}
        ${filterChip("upcoming", "Upcoming", state.memberFilter)}
      </div>
      <div class="card-list">
        ${records.length ? records.map(contactCard).join("") : emptyState("👤", "No matching members", "Add a member manually or convert a successful lead.")}
      </div>
    `;
  }

  function renderSearch() {
    subtitle.textContent = "Search every contact";
    const query = state.queries.search.trim().toLowerCase();
    const results = query ? db.records.filter(r => recordSearchText(r).includes(query)) : db.records;

    main.innerHTML = `
      <h1 class="page-title">Search</h1>
      <p class="page-intro">Search leads, members, one-time customers and saved contacts together.</p>
      <div class="toolbar">
        <div class="search-box"><input id="globalSearch" autofocus value="${escapeHtml(state.queries.search)}" placeholder="Name, phone, email or address" /><span>🔎</span></div>
        <button class="add-fab" data-action="open-add-menu" type="button" aria-label="Add someone">＋</button>
      </div>
      <div class="card-list">
        ${results.length ? results.map(contactCard).join("") : emptyState("🔎", "No result found", "Try a different name, number or address.")}
      </div>
    `;
  }

  function filterChip(value, label, current) {
    return `<button class="filter-chip ${value === current ? "active" : ""}" data-action="set-filter" data-filter="${value}" type="button">${escapeHtml(label)}</button>`;
  }

  function recordSearchText(record) {
    const raw = [record.name, record.mobile, record.email, record.address, record.suburb, record.service, categoryLabel(record)].join(" ").toLowerCase();
    return `${raw} ${normalisePhone(raw)}`;
  }

  function contactCard(record) {
    const dueBadge = isDue(record) ? `<span class="badge badge-due">Due now</span>` : "";
    return `
      <button class="contact-card" data-action="open-detail" data-id="${record.id}" type="button">
        <div class="contact-card-top">
          <div>
            <div class="contact-name">${escapeHtml(record.name || "Unnamed contact")}</div>
            <div class="contact-address">${escapeHtml(record.address || "No address added")}</div>
          </div>
          <span aria-hidden="true">›</span>
        </div>
        <div class="contact-meta">
          <span class="badge ${badgeClass(record)}">${escapeHtml(categoryLabel(record))}</span>
          ${dueBadge}
          ${record.service ? `<span class="badge badge-contact">${escapeHtml(record.service)}</span>` : ""}
        </div>
      </button>
    `;
  }

  function emptyState(icon, heading, text) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function renderDetail() {
    const record = findRecord(state.detailId);
    if (!record) {
      navigate("home");
      return;
    }

    subtitle.textContent = categoryLabel(record);
    const phone = normalisePhone(record.mobile);
    const galleryPhotos = collectRecordPhotos(record);
    const timeline = [...(record.timeline || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    main.innerHTML = `
      <section class="detail-header">
        <div class="contact-meta"><span class="badge ${badgeClass(record)}">${escapeHtml(categoryLabel(record))}</span>${isDue(record) ? `<span class="badge badge-due">Due now</span>` : ""}</div>
        <h1 class="detail-name">${escapeHtml(record.name || "Unnamed contact")}</h1>
        <p class="detail-address">${escapeHtml(record.address || "No address added")}</p>

        <div class="detail-actions">
          ${phone ? `<a class="action-link" href="tel:${escapeHtml(phone)}"><span class="action-icon">📞</span><span>Call</span></a>` : `<button class="action-link disabled" type="button" disabled><span class="action-icon">📞</span><span>No phone</span></button>`}
          ${record.address ? `<a class="action-link" href="${mapsDirectionUrl(record)}" target="_blank" rel="noopener"><span class="action-icon">🗺️</span><span>Navigate</span></a>` : `<button class="action-link disabled" type="button" disabled><span class="action-icon">🗺️</span><span>No address</span></button>`}
          <button class="action-link" data-action="save-vcard" data-id="${record.id}" type="button"><span class="action-icon">📇</span><span>Save to phone</span></button>
          <button class="action-link" data-action="edit-record" data-id="${record.id}" type="button"><span class="action-icon">✏️</span><span>Edit</span></button>
        </div>

        <div class="detail-info">
          <div class="info-box"><span>Mobile</span><strong>${escapeHtml(record.mobile || "Not added")}</strong></div>
          <div class="info-box"><span>Service</span><strong>${escapeHtml(record.service || "Not added")}</strong></div>
          <div class="info-box"><span>Last visit</span><strong>${formatDate(record.lastVisit)}</strong></div>
          <div class="info-box"><span>Next visit</span><strong>${formatDate(record.nextVisit)}</strong></div>
        </div>
      </section>

      ${leadActions(record)}

      <section class="timeline-wrap">
        <div class="timeline-heading-row">
          <h2 class="section-heading">Photos and notes ${galleryPhotos.length ? `(${galleryPhotos.length})` : ""}</h2>
          ${galleryPhotos.length ? `<button class="ghost-button compact-button" data-action="open-gallery" data-id="${record.id}" data-photo-index="${Math.max(0, galleryPhotos.length - 1)}" type="button">View photos</button>` : ""}
        </div>
        <div class="timeline">
          ${timeline.length ? timeline.map((entry, entryIndex) => timelineEntry(record, entry, entryIndex)).join("") : emptyState("📷", "No photos or notes yet", "Tap the camera below to take the first photo.")}
        </div>
      </section>

      <div class="composer">
        <button class="composer-button" data-action="photo-menu" data-id="${record.id}" type="button" aria-label="Add photo">📷</button>
        <textarea id="messageText" rows="1" placeholder="Write or dictate a note..."></textarea>
        <button class="composer-button" data-action="voice-note" type="button" aria-label="Dictate note">🎤</button>
        <button class="composer-button composer-send" data-action="send-note" data-id="${record.id}" type="button">Send</button>
      </div>
    `;
  }

  function leadActions(record) {
    if (record.category === "lead") {
      return `
        <section class="lead-action-panel">
          ${record.leadStage !== "called" ? `<button class="secondary-button button-block" data-action="mark-called" data-id="${record.id}" type="button">✓ Mark as called</button>` : `<div class="badge badge-called">✓ Called</div>`}
          <button class="primary-button button-block" data-action="book-one-time" data-id="${record.id}" type="button">Book one-time job</button>
          <button class="success-button button-block" data-action="convert-member" data-id="${record.id}" type="button">Convert to member</button>
          <button class="ghost-button button-block" data-action="not-proceeding" data-id="${record.id}" type="button">Not proceeding</button>
        </section>
      `;
    }
    if (record.category === "one_time") {
      return `
        <section class="lead-action-panel">
          <button class="success-button button-block" data-action="complete-one-time" data-id="${record.id}" type="button">✓ Complete one-time job</button>
          <button class="secondary-button button-block" data-action="convert-member" data-id="${record.id}" type="button">Make this person a member</button>
        </section>
      `;
    }
    if (["past", "contact", "not_proceeding"].includes(record.category)) {
      return `
        <section class="lead-action-panel">
          <button class="primary-button button-block" data-action="make-lead" data-id="${record.id}" type="button">Make active lead</button>
          <button class="success-button button-block" data-action="convert-member" data-id="${record.id}" type="button">Make member</button>
        </section>
      `;
    }
    if (record.category === "member") {
      return `
        <section class="lead-action-panel">
          <button class="primary-button button-block" data-action="quick-add-route" data-id="${record.id}" type="button">Add to member route</button>
        </section>
      `;
    }
    return "";
  }

  function timelineEntry(record, entry) {
    if (entry.type === "system") {
      return `<div class="timeline-item"><div class="timeline-bubble system">${escapeHtml(entry.text)} · ${formatDate(entry.createdAt, true)}</div></div>`;
    }
    const recordPhotos = collectRecordPhotos(record);
    const photos = entry.photos || [];
    return `
      <div class="timeline-item">
        <div class="timeline-bubble">
          ${photos.length ? `<div class="timeline-photo-grid ${photos.length === 1 ? "single" : ""}">
            ${photos.map(photo => {
              const src = typeof photo === "object" ? photo.src : photo;
              const index = recordPhotos.findIndex(item => item.src === src && item.entryId === entry.id);
              return `<button type="button" data-action="open-gallery" data-id="${record.id}" data-photo-index="${Math.max(0, index)}" style="border:0;padding:0;background:transparent"><img class="timeline-photo" src="${escapeHtml(src)}" alt="Photo for ${escapeHtml(record.name)}" loading="lazy" /></button>`;
            }).join("")}
          </div>` : ""}
          ${entry.text ? `<div class="timeline-text">${escapeHtml(entry.text)}</div>` : ""}
        </div>
        <div class="timeline-time">${formatDate(entry.createdAt, true)}</div>
      </div>
    `;
  }

  function collectRecordPhotos(record) {
    const photos = [];
    (record.timeline || []).forEach(entry => {
      (entry.photos || []).forEach(photo => {
        const src = typeof photo === "object" ? photo.src : photo;
        photos.push({
          src,
          fileId: typeof photo === "object" ? photo.fileId || "" : "",
          entryId: entry.id,
          caption: entry.text || "Photo",
          createdAt: entry.createdAt
        });
      });
    });
    return photos.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function renderRoutes() {
    subtitle.textContent = "Lead and member routes";
    if (state.activeRoute && state.activeRoute.stops.some(stop => stop.status === "pending")) {
      renderActiveRoute();
      return;
    }

    const type = state.routeType;
    const routeQuery = state.queries.routes.trim().toLowerCase();
    let candidates = type === "member"
      ? db.records.filter(r => r.category === "member")
      : db.records.filter(r => r.category === "lead" || r.category === "one_time");

    if (routeQuery) candidates = candidates.filter(record => recordSearchText(record).includes(routeQuery));
    candidates.sort((a, b) => {
      if (type === "member") return Number(isDue(b)) - Number(isDue(a)) || a.name.localeCompare(b.name);
      return Number(b.category === "lead" && b.leadStage !== "called") - Number(a.category === "lead" && a.leadStage !== "called") || a.name.localeCompare(b.name);
    });

    main.innerHTML = `
      <h1 class="page-title">Build a Route</h1>
      <p class="page-intro">Choose the people to visit, then start from Rami's current location.</p>
      <div class="route-type-tabs">
        <button class="route-type-tab ${type === "member" ? "active" : ""}" data-action="set-route-type" data-route-type="member" type="button">Member Route</button>
        <button class="route-type-tab ${type === "lead" ? "active" : ""}" data-action="set-route-type" data-route-type="lead" type="button">Lead Route</button>
      </div>

      <section class="route-builder-card">
        <div class="button-row">
          <button class="secondary-button" data-action="select-route-defaults" type="button">${type === "member" ? "Select all due" : "Select active leads"}</button>
          <button class="secondary-button" data-action="clear-route-selection" type="button">Clear</button>
        </div>
        <div class="location-status">
          <div class="location-dot ${state.routeStart ? "ready" : ""}"></div>
          <div><strong>${state.routeStart ? "Starting location ready" : "Starting location needed"}</strong><span>${state.routeStart ? escapeHtml(state.routeStart.label) : "Use the phone's location, or choose the saved Rosehill start."}</span></div>
        </div>
        <div class="button-stack">
          <button class="primary-button button-block" data-action="use-current-location" type="button">📍 Use My Current Location</button>
          <button class="secondary-button button-block" data-action="use-saved-start" type="button">⌂ Use 7 Weston St, Rosehill</button>
        </div>

        <div class="route-list-heading">
          <h2 class="section-heading">Choose ${type === "member" ? "members" : "leads"}</h2>
          <span class="selected-pill">${state.routeSelections.size} selected</span>
        </div>
        <div class="search-box route-search"><input id="routeSearch" value="${escapeHtml(state.queries.routes)}" placeholder="Search this list" /><span>🔎</span></div>
        <div class="route-candidate-list">
          ${candidates.length ? candidates.map(routeSelectionRow).join("") : emptyState("🗺", "Nothing found", routeQuery ? "Try a different search." : `There are no ${type === "member" ? "members" : "active leads"} to route.`)}
        </div>
        <button class="success-button button-block sticky-build-button" data-action="build-route" type="button">Build Route (${state.routeSelections.size})</button>
      </section>

      <div class="prototype-note">The route keeps each street together. Records without saved coordinates can still open in Google Maps and are placed at the end of the route for now.</div>
    `;
  }

  function routeSelectionRow(record) {
    const checked = state.routeSelections.has(record.id);
    return `
      <div class="selection-row">
        <input id="route-${record.id}" data-action="toggle-route-selection" data-id="${record.id}" type="checkbox" ${checked ? "checked" : ""} />
        <label for="route-${record.id}"><strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(record.address)}${isDue(record) ? " · Due now" : ""}${!hasCoords(record) ? " · Needs map location" : ""}</span></label>
      </div>
    `;
  }

  function renderActiveRoute() {
    const route = state.activeRoute;
    const pending = route.stops.filter(stop => stop.status === "pending");
    const finished = route.stops.filter(stop => stop.status !== "pending");
    const completedCount = finished.length;
    const nextStop = pending[0];
    const record = nextStop ? findRecord(nextStop.recordId) : null;
    if (!record) {
      state.activeRoute = null;
      saveDatabase();
      renderRoutes();
      return;
    }
    const percent = route.stops.length ? Math.round((completedCount / route.stops.length) * 100) : 0;
    const distance = estimateDistanceFromStart(route, nextStop);

    main.innerHTML = `
      <h1 class="page-title">${route.type === "member" ? "Member" : "Lead"} Route</h1>
      <section class="active-route-card">
        <div class="route-progress">
          <div class="route-progress-row"><span>${completedCount} of ${route.stops.length} completed</span><span>${percent}%</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        </div>
        <div class="next-stop">
          <div class="next-stop-label">NEXT STOP</div>
          <h2>${escapeHtml(record.name)}</h2>
          <p>${escapeHtml(record.address || "No address added")}</p>
          ${distance ? `<p style="margin-top:8px"><strong>About ${distance}</strong> away</p>` : ""}
        </div>
        <div class="button-stack" style="margin-top:14px">
          ${record.address ? `<a class="primary-button button-block" href="${mapsDirectionUrl(record, route.currentLocation)}" target="_blank" rel="noopener">🗺 Start Google Maps</a>` : `<button class="primary-button button-block" type="button" disabled>Address needed for Maps</button>`}
          ${record.mobile ? `<a class="secondary-button button-block" href="tel:${escapeHtml(normalisePhone(record.mobile))}">📞 Call ${escapeHtml(record.name.split(" ")[0] || "customer")}</a>` : ""}
          <button class="secondary-button button-block" data-action="open-route-contact" data-id="${record.id}" type="button">View photos and notes</button>
          <div class="button-row">
            <button class="secondary-button" data-action="skip-route-stop" type="button">Skip</button>
            <button class="success-button" data-action="complete-route-stop" type="button">Done</button>
          </div>
        </div>
        <button class="ghost-button button-block" style="margin-top:7px" data-action="refresh-route-location" type="button">📍 Recalculate from my location</button>
        <button class="ghost-button button-block" data-action="finish-route" type="button">End route</button>

        <div class="route-list-heading">
          <h2 class="section-heading">Upcoming stops</h2>
          <span class="selected-pill">${pending.length} left</span>
        </div>
        <div class="route-stop-list">
          ${pending.map((stop, index) => {
            const item = findRecord(stop.recordId);
            return `<button class="route-stop-mini route-stop-button" data-action="open-route-contact" data-id="${item ? item.id : ""}" type="button"><div class="stop-number">${index + 1}</div><div><strong>${escapeHtml(item ? item.name : "Unknown")}</strong><span>${escapeHtml(item ? item.address : "")}</span></div><div class="stop-chevron">›</div></button>`;
          }).join("")}
        </div>
        ${finished.length ? `<details class="completed-stops"><summary>Completed or skipped (${finished.length})</summary><div>${finished.map(stop => { const item = findRecord(stop.recordId); return `<div class="completed-stop-row"><span>${escapeHtml(item ? item.name : "Unknown")}</span><strong>${stop.status === "done" ? "Done" : "Skipped"}</strong></div>`; }).join("")}</div></details>` : ""}
      </section>
    `;
  }

  function hasCoords(record) { return Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng)); }

  function estimateDistanceFromStart(route, stop) {
    const record = findRecord(stop.recordId);
    if (!record || !route.currentLocation || !hasCoords(record)) return "";
    const km = haversineKm(route.currentLocation, { lat: Number(record.lat), lng: Number(record.lng) });
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  function openAddMenu() {
    showModal(`
      <div class="modal-header"><div><h2>Add someone</h2><p>Choose the simplest starting type.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <div class="choice-grid">
        <button class="choice-button" data-action="add-specific" data-category="lead" type="button"><span class="choice-icon">⚡</span><div><strong>Add Lead</strong><span>A new enquiry that may become a job or member.</span></div></button>
        <button class="choice-button" data-action="add-specific" data-category="member" type="button"><span class="choice-icon">👤</span><div><strong>Add Member</strong><span>A regular pool-service customer.</span></div></button>
        <button class="choice-button" data-action="add-specific" data-category="contact" type="button"><span class="choice-icon">📇</span><div><strong>Save Contact</strong><span>Keep their details without making them active.</span></div></button>
      </div>
    `);
  }

  function openAddForm(category) {
    const title = category === "member" ? "Add Member" : category === "contact" ? "Save Contact" : "Add Lead";
    showModal(`
      <div class="modal-header"><div><h2>${title}</h2><p>Only the name and mobile are required.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <form id="addRecordForm" class="form-grid" data-category="${category}">
        <div class="form-field"><label for="addName">Name *</label><input id="addName" name="name" required autocomplete="name" /></div>
        <div class="form-field"><label for="addMobile">Mobile *</label><input id="addMobile" name="mobile" required inputmode="tel" autocomplete="tel" /></div>
        <div class="form-field"><label for="addAddress">Address</label><input id="addAddress" name="address" autocomplete="street-address" placeholder="Start typing the full address" /><div class="form-hint">Google address matching will be connected in production.</div></div>
        <div class="form-field"><label for="addEmail">Email (optional)</label><input id="addEmail" name="email" type="email" autocomplete="email" /></div>
        <div class="form-field"><label for="addService">Service or note (optional)</label><textarea id="addService" name="service"></textarea></div>
        <button class="primary-button button-block" type="submit">Save</button>
      </form>
    `);
  }

  function openEditForm(recordId) {
    const record = findRecord(recordId);
    if (!record) return;
    showModal(`
      <div class="modal-header"><div><h2>Edit details</h2><p>Change only what needs updating.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <form id="editRecordForm" class="form-grid" data-record-id="${record.id}">
        <div class="form-field"><label for="editName">Name *</label><input id="editName" name="name" required autocomplete="name" value="${escapeHtml(record.name || "")}" /></div>
        <div class="form-field"><label for="editMobile">Mobile</label><input id="editMobile" name="mobile" inputmode="tel" autocomplete="tel" value="${escapeHtml(record.mobile || "")}" /></div>
        <div class="form-field"><label for="editAddress">Address</label><input id="editAddress" name="address" autocomplete="street-address" value="${escapeHtml(record.address || "")}" /></div>
        <div class="form-field"><label for="editEmail">Email</label><input id="editEmail" name="email" type="email" autocomplete="email" value="${escapeHtml(record.email || "")}" /></div>
        <div class="form-field"><label for="editService">Service or note</label><textarea id="editService" name="service">${escapeHtml(record.service || "")}</textarea></div>
        ${record.category === "member" ? `<div class="form-field"><label for="editNextVisit">Next visit</label><input id="editNextVisit" name="nextVisit" type="date" value="${escapeHtml(record.nextVisit || "")}" /></div>` : ""}
        <button class="primary-button button-block" type="submit">Save changes</button>
      </form>
    `);
  }

  function submitEditForm(form) {
    const record = findRecord(form.dataset.recordId);
    if (!record) return;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) {
      showToast("A name is required.");
      return;
    }
    const previousAddress = record.address || "";
    record.name = name;
    record.mobile = String(data.get("mobile") || "").trim();
    record.address = String(data.get("address") || "").trim();
    record.email = String(data.get("email") || "").trim();
    record.service = String(data.get("service") || "").trim();
    if (record.category === "member") record.nextVisit = String(data.get("nextVisit") || "").trim();
    if (record.address !== previousAddress) {
      record.streetKey = deriveStreetKey(record.address);
      record.lat = null;
      record.lng = null;
    }
    addSystemEntry(record, "Contact details updated.");
    saveDatabase();
    closeModal();
    renderDetail();
    showToast("Details updated.");
  }

  function submitAddForm(form) {
    const data = new FormData(form);
    const category = form.dataset.category || "lead";
    const name = String(data.get("name") || "").trim();
    const mobile = String(data.get("mobile") || "").trim();
    if (!name || !mobile) {
      showToast("Name and mobile are required.");
      return;
    }
    const address = String(data.get("address") || "").trim();
    const record = {
      id: uid(category === "member" ? "MEM" : category === "contact" ? "CONTACT" : "LEAD"),
      category,
      leadStage: category === "lead" ? "new" : "",
      name,
      mobile,
      email: String(data.get("email") || "").trim(),
      address,
      suburb: "",
      postcode: "",
      lat: null,
      lng: null,
      streetKey: deriveStreetKey(address),
      service: String(data.get("service") || "").trim(),
      callback: category === "lead" ? "Manual lead" : "",
      createdAt: isoNow(),
      lastVisit: "",
      nextVisit: category === "member" ? addDays(dateOnly(), 28) : "",
      timeline: [{ id: uid("TL"), type: "system", text: `${categoryLabel({ category, leadStage: category === "lead" ? "new" : "" })} added manually.`, createdAt: isoNow(), photos: [] }]
    };
    db.records.unshift(record);
    saveDatabase();
    closeModal();
    state.detailId = record.id;
    navigate("detail", { detailId: record.id });
    showToast(`${name} saved.`);
  }

  function deriveStreetKey(address) {
    return String(address || "")
      .toUpperCase()
      .replace(/^\s*(?:UNIT\s+)?[\dA-Z/-]+\s+/, "")
      .replace(/,.*$/, "")
      .replace(/\s+/g, " ")
      .trim() || String(address || "").toUpperCase();
  }

  function showModal(content) {
    modalRoot.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${content}</div>`;
    modalRoot.classList.remove("hidden");
    modalRoot.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => modalRoot.querySelector("input, textarea, button")?.focus(), 30);
  }

  function closeModal() {
    modalRoot.classList.add("hidden");
    modalRoot.setAttribute("aria-hidden", "true");
    modalRoot.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function openPhotoMenu(recordId) {
    pendingPhotoRecordId = recordId;
    showModal(`
      <div class="modal-header"><div><h2>Add a photo</h2><p>The note is optional.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <div class="choice-grid">
        <button class="choice-button" data-action="take-photo" type="button"><span class="choice-icon">📷</span><div><strong>Take Photo Now</strong><span>Open the phone camera from the site.</span></div></button>
        <button class="choice-button" data-action="choose-photo" type="button"><span class="choice-icon">🖼️</span><div><strong>Choose From Phone</strong><span>Select a photo already on the device.</span></div></button>
      </div>
    `);
  }

  async function handlePhotoFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      showToast("Please choose a photo.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast("That photo is too large. Choose a smaller one.");
      return;
    }
    try {
      showToast("Preparing photo...");
      pendingPhotoData = await compressImage(file, 1024, 0.70);
      showModal(`
        <div class="modal-header"><div><h2>Send Photo</h2><p>Add a note only when useful.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
        <img src="${pendingPhotoData}" alt="Photo preview" style="width:100%;max-height:44vh;object-fit:contain;border-radius:16px;background:#e5e7eb" />
        <div class="form-field" style="margin-top:14px"><label for="photoNote">Optional note</label><textarea id="photoNote" placeholder="Tap the microphone on the phone keyboard to dictate..."></textarea></div>
        <div class="button-row" style="margin-top:13px"><button class="secondary-button" data-action="discard-photo" type="button">Retake</button><button class="primary-button" data-action="send-photo" type="button">Send</button></div>
      `);
    } catch (error) {
      console.error(error);
      showToast("Could not read that photo.");
    } finally {
      cameraInput.value = "";
      libraryInput.value = "";
    }
  }

  function compressImage(file, maxDimension, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function sendPhoto() {
    const record = findRecord(pendingPhotoRecordId);
    if (!record || !pendingPhotoData) return;
    const note = String(document.getElementById("photoNote")?.value || "").trim();
    const sendButton = modalRoot.querySelector('[data-action="send-photo"]');
    if (sendButton) { sendButton.disabled = true; sendButton.textContent = "Uploading…"; }
    try {
      const response = await fetch(`${API_BASE}/api/upload-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ dataUrl: pendingPhotoData, contactId: record.id, contactName: record.name })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Photo upload failed.");
      record.timeline = record.timeline || [];
      record.timeline.push({
        id: uid("TL"),
        type: "message",
        text: note,
        createdAt: isoNow(),
        photos: [{ fileId: result.file.id, src: result.file.src }]
      });
      saveDatabase();
      pendingPhotoData = null;
      pendingPhotoRecordId = null;
      closeModal();
      renderDetail();
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 20);
      showToast("Photo saved to Google Drive.");
    } catch (error) {
      console.error(error);
      if (sendButton) { sendButton.disabled = false; sendButton.textContent = "Send"; }
      showToast(error.message || "Could not upload the photo.");
    }
  }

  function sendNote(recordId) {
    const record = findRecord(recordId);
    const textarea = document.getElementById("messageText");
    const text = String(textarea?.value || "").trim();
    if (!record || !text) {
      showToast("Write or dictate a note first.");
      return;
    }
    record.timeline = record.timeline || [];
    record.timeline.push({ id: uid("TL"), type: "message", text, createdAt: isoNow(), photos: [] });
    saveDatabase();
    renderDetail();
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 20);
  }

  function startVoiceNote() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const textarea = document.getElementById("messageText");
    if (!SpeechRecognition) {
      showToast("Use the microphone on the phone keyboard to dictate.");
      textarea?.focus();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => showToast("Listening...");
    recognition.onerror = () => showToast("Voice typing was not available. Try the keyboard microphone.");
    recognition.onresult = event => {
      const text = event.results[0][0].transcript;
      textarea.value = `${textarea.value ? textarea.value + " " : ""}${text}`;
      textarea.focus();
      showToast("Voice note added. Check it, then press Send.");
    };
    recognition.start();
  }

  function openGallery(recordId, startIndex) {
    const record = findRecord(recordId);
    if (!record) return;
    state.galleryPhotos = collectRecordPhotos(record);
    if (!state.galleryPhotos.length) return;
    state.galleryIndex = Math.min(Math.max(0, Number(startIndex) || 0), state.galleryPhotos.length - 1);
    gallery.classList.remove("hidden");
    gallery.setAttribute("aria-hidden", "false");
    document.body.classList.add("gallery-open");
    updateGallery();
  }

  function updateGallery() {
    const item = state.galleryPhotos[state.galleryIndex];
    if (!item) return;
    galleryImage.src = item.src;
    galleryCounter.textContent = `${state.galleryIndex + 1} of ${state.galleryPhotos.length}`;
    galleryCaption.textContent = `${item.caption || "Photo"} · ${formatDate(item.createdAt, true)}`;
    galleryPrev.disabled = state.galleryPhotos.length <= 1;
    galleryNext.disabled = state.galleryPhotos.length <= 1;
  }

  function moveGallery(direction) {
    const count = state.galleryPhotos.length;
    if (!count) return;
    state.galleryIndex = (state.galleryIndex + direction + count) % count;
    updateGallery();
  }

  function closeGallery() {
    gallery.classList.add("hidden");
    gallery.setAttribute("aria-hidden", "true");
    galleryImage.src = "";
    document.body.classList.remove("gallery-open");
  }

  function saveVCard(recordId) {
    const record = findRecord(recordId);
    if (!record) return;
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${vcardEscape(record.name)}`,
      `N:${vcardEscape(record.name)};;;;`,
      record.mobile ? `TEL;TYPE=CELL:${vcardEscape(record.mobile)}` : "",
      record.email ? `EMAIL:${vcardEscape(record.email)}` : "",
      record.address ? `ADR;TYPE=WORK:;;${vcardEscape(record.address)};;;;Australia` : "",
      `NOTE:${vcardEscape(`Rami Pool Care - ${categoryLabel(record)}`)}`,
      "END:VCARD"
    ].filter(Boolean);
    const blob = new Blob([lines.join("\r\n")], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${record.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "contact"}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Contact card ready to add to the phone.");
  }

  function vcardEscape(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function addSystemEntry(record, text) {
    record.timeline = record.timeline || [];
    record.timeline.push({ id: uid("TL"), type: "system", text, createdAt: isoNow(), photos: [] });
  }

  function updateCategory(recordId, category, message) {
    const record = findRecord(recordId);
    if (!record) return;
    record.category = category;
    if (category === "member") {
      record.leadStage = "";
      record.nextVisit = record.nextVisit || addDays(dateOnly(), 28);
    }
    if (category === "lead") record.leadStage = "new";
    addSystemEntry(record, message);
    saveDatabase();
    renderDetail();
    showToast(message);
  }

  function mapsDirectionUrl(record, origin) {
    const destination = hasCoords(record) ? `${record.lat},${record.lng}` : record.address;
    const base = "https://www.google.com/maps/dir/?api=1";
    const originPart = origin && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lng))
      ? `&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}`
      : "";
    return `${base}${originPart}&destination=${encodeURIComponent(destination || record.address || "")}&travelmode=driving`;
  }

  function selectRouteDefaults() {
    state.routeSelections.clear();
    const records = state.routeType === "member"
      ? db.records.filter(isDue)
      : db.records.filter(r => r.category === "lead" || r.category === "one_time");
    records.forEach(r => state.routeSelections.add(r.id));
    renderRoutes();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      showToast("This device cannot provide a location. Use the saved Rosehill start.");
      return;
    }
    showToast("Finding current location...");
    navigator.geolocation.getCurrentPosition(
      position => {
        state.routeStart = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Current phone location"
        };
        renderRoutes();
        showToast("Current location ready.");
      },
      error => {
        const message = error && error.code === 1
          ? "Location permission is off. Allow it in the browser, or use the Rosehill start."
          : "Could not get the current location. Try again or use the Rosehill start.";
        showToast(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  function useSavedStart() {
    state.routeStart = { ...CONFIG.defaultStartCoordinates, label: "7 Weston St, Rosehill NSW 2142" };
    renderRoutes();
    showToast("Rosehill starting point ready.");
  }

  function refreshActiveRouteLocation() {
    const route = state.activeRoute;
    if (!route) return;
    if (!navigator.geolocation) {
      showToast("Current location is not available on this device.");
      return;
    }
    showToast("Updating route from the current location...");
    navigator.geolocation.getCurrentPosition(
      position => {
        route.currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        const remainingStops = route.stops.filter(stop => stop.status === "pending");
        const remainingRecords = remainingStops.map(stop => findRecord(stop.recordId)).filter(Boolean);
        const reordered = optimiseRecords(remainingRecords, route.currentLocation);
        const finished = route.stops.filter(stop => stop.status !== "pending");
        route.stops = finished.concat(reordered.map(item => ({ recordId: item.id, status: "pending" })));
        saveDatabase();
        renderRoutes();
        showToast("Remaining stops recalculated.");
      },
      () => showToast("Could not update the current location."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  }

  function buildRoute() {
    const records = [...state.routeSelections].map(findRecord).filter(Boolean);
    if (!records.length) {
      showToast("Select at least one stop.");
      return;
    }
    if (!state.routeStart) {
      showToast("Tap Use My Current Location first.");
      return;
    }
    const ordered = optimiseRecords(records, state.routeStart);
    state.activeRoute = {
      id: uid("ROUTE"),
      type: state.routeType,
      createdAt: isoNow(),
      start: { ...state.routeStart },
      currentLocation: { ...state.routeStart },
      stops: ordered.map(record => ({ recordId: record.id, status: "pending" }))
    };
    state.routeSelections.clear();
    saveDatabase();
    window.scrollTo({ top: 0, behavior: "auto" });
    renderRoutes();
    showToast("Route ready.");
  }

  function optimiseRecords(records, start) {
    const located = records.filter(hasCoords);
    const unlocated = records.filter(record => !hasCoords(record));
    const groupsMap = new Map();

    located.forEach(record => {
      const key = record.streetKey || deriveStreetKey(record.address) || record.id;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(record);
    });

    const groups = [...groupsMap.entries()].map(([key, items]) => {
      const centroid = {
        lat: items.reduce((sum, item) => sum + Number(item.lat), 0) / items.length,
        lng: items.reduce((sum, item) => sum + Number(item.lng), 0) / items.length
      };
      return { key, items, centroid };
    });

    const ordered = [];
    let current = { lat: Number(start.lat), lng: Number(start.lng) };
    const remaining = groups.slice();

    while (remaining.length) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      remaining.forEach((group, index) => {
        const distance = haversineKm(current, group.centroid);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      const group = remaining.splice(bestIndex, 1)[0];
      const seq = orderStreetGroup(group.items, current);
      seq.forEach(record => ordered.push(record));
      const last = seq[seq.length - 1];
      current = { lat: Number(last.lat), lng: Number(last.lng) };
    }

    return ordered.concat(unlocated.sort((a, b) => a.name.localeCompare(b.name)));
  }

  function orderStreetGroup(items, current) {
    if (items.length <= 1) return items.slice();
    const sorted = items.slice().sort((a, b) => streetNumber(a.address) - streetNumber(b.address));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstDistance = haversineKm(current, { lat: Number(first.lat), lng: Number(first.lng) });
    const lastDistance = haversineKm(current, { lat: Number(last.lat), lng: Number(last.lng) });
    return firstDistance <= lastDistance ? sorted : sorted.reverse();
  }

  function streetNumber(address) {
    const match = String(address || "").match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  }

  function haversineKm(a, b) {
    const toRad = value => value * Math.PI / 180;
    const earth = 6371;
    const dLat = toRad(Number(b.lat) - Number(a.lat));
    const dLng = toRad(Number(b.lng) - Number(a.lng));
    const lat1 = toRad(Number(a.lat));
    const lat2 = toRad(Number(b.lat));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  async function completeCurrentStop(skip = false) {
    const route = state.activeRoute;
    if (!route) return;
    const currentStop = route.stops.find(stop => stop.status === "pending");
    if (!currentStop) return;
    currentStop.status = skip ? "skipped" : "done";
    const record = findRecord(currentStop.recordId);

    if (record && !skip) {
      record.lastVisit = dateOnly();
      if (record.category === "member") record.nextVisit = addDays(dateOnly(), 28);
      if (record.category === "one_time") record.category = "past";
      addSystemEntry(record, record.category === "past" ? "One-time job completed." : "Visit completed.");
    }

    if (record && hasCoords(record)) route.currentLocation = { lat: Number(record.lat), lng: Number(record.lng) };
    saveDatabase();

    const remainingStops = route.stops.filter(stop => stop.status === "pending");
    if (!remainingStops.length) {
      db.routeHistory.unshift({ ...route, completedAt: isoNow() });
      state.activeRoute = null;
      db.activeRoute = null;
      saveDatabase();
      window.scrollTo({ top: 0, behavior: "auto" });
      renderRoutes();
      showToast("Route completed.");
      return;
    }

    const remainingRecords = remainingStops.map(stop => findRecord(stop.recordId)).filter(Boolean);
    const reordered = optimiseRecords(remainingRecords, route.currentLocation);
    const finished = route.stops.filter(stop => stop.status !== "pending");
    route.stops = finished.concat(reordered.map(item => ({ recordId: item.id, status: "pending" })));
    saveDatabase();
    window.scrollTo({ top: 0, behavior: "auto" });
    renderRoutes();
    showToast(skip ? "Stop skipped." : "Visit completed. Remaining route updated.");
  }

  function finishRoute() {
    if (state.activeRoute) {
      db.routeHistory.unshift({ ...state.activeRoute, endedAt: isoNow() });
      saveDatabase();
    }
    state.activeRoute = null;
    db.activeRoute = null;
    state.routeSelections.clear();
    saveDatabase();
    renderRoutes();
    showToast("Route ended.");
  }

  function quickAddRoute(recordId) {
    state.routeType = "member";
    state.routeSelections.clear();
    state.routeSelections.add(recordId);
    navigate("routes");
    showToast("Member selected. Add others or build the route.");
  }

  /* ===== V4 SCHEDULER, RECURRING VISITS, AREA MATCHING AND RETURN-HOME ROUTES ===== */

  function settingNumber(key, fallback) {
    const value = Number(db?.settings?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function settingYes(key, fallback = true) {
    const value = db?.settings?.[key];
    if (value == null || value === "") return fallback;
    return !/^(no|false|0)$/i.test(String(value));
  }

  function homeLocation(database = db) {
    const settings = database?.settings || {};
    const lat = Number(settings.HomeLatitude ?? CONFIG.defaultStartCoordinates?.lat ?? -33.82313);
    const lng = Number(settings.HomeLongitude ?? CONFIG.defaultStartCoordinates?.lng ?? 151.02078);
    return {
      lat: Number.isFinite(lat) ? lat : -33.82313,
      lng: Number.isFinite(lng) ? lng : 151.02078,
      label: settings.HomeAddress || "Home"
    };
  }

  function startOfWeek(value = new Date()) {
    const d = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
    const day = d.getDay();
    const shift = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + shift);
    return d;
  }

  function weekDate(offset, dayIndex) {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + offset * 7 + dayIndex);
    return dateOnly(d);
  }

  function dateDiffDays(a, b) {
    const first = new Date(`${a}T12:00:00`);
    const second = new Date(`${b}T12:00:00`);
    return Math.round((second - first) / 86400000);
  }

  function dayName(dateString, long = false) {
    return new Intl.DateTimeFormat("en-AU", { weekday: long ? "long" : "short" }).format(new Date(`${dateString}T12:00:00`));
  }

  function dayTitle(dateString) {
    return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${dateString}T12:00:00`));
  }

  function activeAppointment(item) {
    return item && ["Scheduled", "Confirmed"].includes(item.status);
  }

  function appointmentsForDate(dateString) {
    return (db.appointments || [])
      .filter(item => item.scheduledDate === dateString && !["Cancelled", "Rescheduled"].includes(item.status))
      .sort((a, b) => (Number(a.routeOrder) || 9999) - (Number(b.routeOrder) || 9999) || appointmentName(a).localeCompare(appointmentName(b)));
  }

  function futureAppointmentsForContact(contactId) {
    return (db.appointments || [])
      .filter(item => item.contactId === contactId && activeAppointment(item) && item.scheduledDate >= dateOnly())
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }

  function appointmentName(item) {
    return findRecord(item?.contactId)?.name || "Unknown customer";
  }

  function appointmentRecord(item) {
    return item ? findRecord(item.contactId) : null;
  }

  function visitTypeFor(record) {
    if (record?.category === "member") return "Member Service";
    if (record?.category === "one_time") return "One-Time Job";
    return "Lead Visit";
  }

  function areaForRecord(record) {
    return record?.suburb || String(record?.address || "").split(",").slice(-2, -1)[0]?.trim() || "Area not set";
  }

  function syncRecordNextVisit(contactId) {
    const record = findRecord(contactId);
    if (!record) return;
    const next = futureAppointmentsForContact(contactId)[0];
    record.nextVisit = next?.scheduledDate || "";
  }

  function createAppointment(contactId, scheduledDate, options = {}) {
    const record = findRecord(contactId);
    if (!record || !scheduledDate) return null;
    const existing = (db.appointments || []).find(item => item.contactId === contactId && item.scheduledDate === scheduledDate && activeAppointment(item));
    if (existing) return existing;
    const item = {
      id: uid("APT"),
      contactId,
      scheduledDate,
      visitType: options.visitType || visitTypeFor(record),
      status: options.status || "Scheduled",
      repeatWeeks: Number(options.repeatWeeks ?? record.defaultRepeatWeeks ?? (record.category === "member" ? 4 : 0)) || 0,
      areaLabel: options.areaLabel || areaForRecord(record),
      routeOrder: null,
      reminderEnabled: options.reminderEnabled ?? record.smsRemindersEnabled !== false,
      reminderStatus: "Pending",
      reminderSentAt: "",
      reminderProviderId: "",
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    db.appointments.push(item);
    syncRecordNextVisit(contactId);
    addSystemEntry(record, `Visit scheduled for ${formatDate(scheduledDate)}.`);
    return item;
  }

  function updateAppointmentDate(item, newDate) {
    if (!item || !newDate) return;
    item.scheduledDate = newDate;
    item.status = "Scheduled";
    item.routeOrder = null;
    item.reminderStatus = "Pending";
    item.reminderSentAt = "";
    item.reminderProviderId = "";
    item.updatedAt = isoNow();
    item.areaLabel = areaForRecord(appointmentRecord(item));
    syncRecordNextVisit(item.contactId);
  }

  function isDue(record) {
    if (record.category !== "member" || record.paused) return false;
    const next = futureAppointmentsForContact(record.id)[0];
    if (next) return next.scheduledDate <= dateOnly();
    if (!record.nextVisit) return true;
    return record.nextVisit <= dateOnly();
  }

  function unscheduledDueMembers() {
    return db.records.filter(record => record.category === "member" && isDue(record) && !futureAppointmentsForContact(record.id).length);
  }

  function dayAreaSummary(items) {
    const counts = new Map();
    items.forEach(item => {
      const area = item.areaLabel || areaForRecord(appointmentRecord(item));
      if (area && area !== "Area not set") counts.set(area, (counts.get(area) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([area]) => area).slice(0, 2).join(" / ") || "Mixed areas";
  }

  function dateAppointmentsWithCoords(dateString) {
    return appointmentsForDate(dateString).map(appointmentRecord).filter(record => record && hasCoords(record));
  }

  function dayCentroid(dateString) {
    const records = dateAppointmentsWithCoords(dateString);
    if (!records.length) return null;
    return {
      lat: records.reduce((sum, item) => sum + Number(item.lat), 0) / records.length,
      lng: records.reduce((sum, item) => sum + Number(item.lng), 0) / records.length
    };
  }

  function nearbyLeadsForDate(dateString) {
    const existingIds = new Set(appointmentsForDate(dateString).map(item => item.contactId));
    const areas = new Set(appointmentsForDate(dateString).map(item => (item.areaLabel || areaForRecord(appointmentRecord(item))).toLowerCase()).filter(Boolean));
    const centroid = dayCentroid(dateString);
    return db.records
      .filter(record => ["lead", "one_time"].includes(record.category) && !existingIds.has(record.id) && !futureAppointmentsForContact(record.id).length)
      .map(record => {
        const sameArea = areas.has(areaForRecord(record).toLowerCase());
        const distance = centroid && hasCoords(record) ? haversineKm(centroid, { lat: Number(record.lat), lng: Number(record.lng) }) : Infinity;
        return { record, sameArea, distance };
      })
      .filter(item => item.sameArea || item.distance <= 12)
      .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || a.distance - b.distance)
      .slice(0, 6);
  }

  function bestUpcomingAreaForRecord(record) {
    const maxDays = settingNumber("NearbyLeadSearchDays", 14);
    const today = dateOnly();
    const candidates = [];
    for (let i = 0; i <= maxDays; i += 1) {
      const date = addDays(today, i);
      const items = appointmentsForDate(date).filter(activeAppointment);
      if (!items.length) continue;
      const areas = new Set(items.map(item => (item.areaLabel || areaForRecord(appointmentRecord(item))).toLowerCase()));
      const sameArea = areas.has(areaForRecord(record).toLowerCase());
      const centroid = dayCentroid(date);
      const distance = centroid && hasCoords(record) ? haversineKm(centroid, { lat: Number(record.lat), lng: Number(record.lng) }) : Infinity;
      if (sameArea || distance <= 12) candidates.push({ date, items, sameArea, distance, area: dayAreaSummary(items) });
    }
    return candidates.sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || a.date.localeCompare(b.date) || a.distance - b.distance)[0] || null;
  }

  function reminderMessage(record) {
    const template = db.settings?.SMSMessageTemplate || "Hi {firstName},\n\nJust a quick note to let you know I’ll be by tomorrow to service your pool. Please ensure the side gate is unlocked so I can access the pool area.\n\nThank you, and I’ll see you tomorrow.\n\nRegards,\nRami Narse\nJim’s Pool Care Parramatta";
    const firstName = String(record?.name || "there").trim().split(/\s+/)[0] || "there";
    return template.replaceAll("{firstName}", firstName).replaceAll("{name}", record?.name || firstName);
  }

  function appointmentStatusBadge(item) {
    const status = item.status || "Scheduled";
    const cls = status === "Completed" ? "badge-member" : status === "Skipped" ? "badge-past" : status === "Confirmed" ? "badge-called" : "badge-contact";
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
  }

  function navigate(screen, options = {}) {
    state.previousScreen = state.screen;
    state.screen = screen;
    if (options.detailId !== undefined) state.detailId = options.detailId;
    if (options.date !== undefined) state.selectedDate = options.date;
    window.scrollTo({ top: 0, behavior: "auto" });
    render();
  }

  function render() {
    document.querySelectorAll(".nav-item").forEach(button => {
      const target = button.dataset.screen;
      let activeTarget = state.screen === "day" ? "schedule" : state.screen === "detail" ? detailParentScreen() : state.screen;
      if (activeTarget === "day") activeTarget = "schedule";
      button.classList.toggle("active", target === activeTarget);
    });
    backButton.classList.toggle("hidden", !["detail", "search", "day", "settings"].includes(state.screen));
    bottomNav.classList.remove("hidden");

    switch (state.screen) {
      case "schedule": renderSchedule(); break;
      case "day": renderDay(); break;
      case "leads": renderLeads(); break;
      case "members": renderMembers(); break;
      case "routes": renderRoutes(); break;
      case "search": renderSearch(); break;
      case "settings": renderSettings(); break;
      case "detail": renderDetail(); break;
      default: renderHome();
    }
    if (!main.querySelector("input:focus, textarea:focus, select:focus")) main.focus({ preventScroll: true });
  }

  function detailParentScreen() {
    if (["home", "leads", "members", "search", "routes", "schedule", "day"].includes(state.detailReturnScreen)) return state.detailReturnScreen;
    const record = findRecord(state.detailId);
    return record?.category === "member" ? "members" : "leads";
  }

  function renderHome() {
    subtitle.textContent = "Weekly pool-service planner";
    const today = dateOnly();
    const tomorrow = addDays(today, 1);
    const todayItems = appointmentsForDate(today).filter(item => !["Cancelled", "Completed"].includes(item.status));
    const tomorrowItems = appointmentsForDate(tomorrow).filter(activeAppointment);
    const activeLeads = db.records.filter(record => record.category === "lead").length;
    const dueUnscheduled = unscheduledDueMembers().length;
    const routeActive = state.activeRoute && (state.activeRoute.phase === "return_home" || state.activeRoute.stops?.some(stop => stop.status === "pending"));

    main.innerHTML = `
      <section class="hero-card schedule-hero">
        <div class="eyebrow">${escapeHtml(dayTitle(today))}</div>
        <h1>${todayItems.length ? `${todayItems.length} visit${todayItems.length === 1 ? "" : "s"} today` : "No visits scheduled today"}</h1>
        <p>${todayItems.length ? escapeHtml(dayAreaSummary(todayItems)) : "Open the schedule to plan Rami’s week by area."}</p>
        <button class="primary-button button-block hero-action" data-action="${routeActive ? "go-routes" : "open-day"}" data-date="${today}" type="button">${routeActive ? "Resume Today’s Run" : todayItems.length ? "Open Today’s Run" : "Plan Today"}</button>
      </section>

      <div class="home-grid">
        <button class="big-tile full" data-action="go-schedule" type="button">
          <span class="tile-icon">📅</span><strong>Schedule</strong>
          <span>Plan each day, repeat visits in 2 or 4 weeks, and group nearby areas.</span>
          ${dueUnscheduled ? `<span class="tile-badge">${dueUnscheduled}</span>` : ""}
        </button>
        <button class="big-tile" data-action="go-leads" type="button">
          <span class="tile-icon">⚡</span><strong>New Leads</strong>
          <span>See the next day Rami will already be near each lead.</span>
          ${activeLeads ? `<span class="tile-badge">${activeLeads}</span>` : ""}
        </button>
        <button class="big-tile" data-action="go-members" type="button">
          <span class="tile-icon">👥</span><strong>Customers</strong>
          <span>Call, navigate, see photos and change regular visit timing.</span>
        </button>
        <button class="big-tile" data-action="go-search" type="button">
          <span class="tile-icon">🔎</span><strong>Search</strong>
          <span>Find any member, lead, one-time customer or saved contact.</span>
        </button>
        <button class="big-tile" data-action="open-add-menu" type="button">
          <span class="tile-icon">＋</span><strong>Add Someone</strong>
          <span>Manually add a lead, member or saved contact.</span>
        </button>
      </div>

      <section class="reminder-summary-card">
        <div><strong>Tomorrow: ${tomorrowItems.length} visit${tomorrowItems.length === 1 ? "" : "s"}</strong><span>${tomorrowItems.length ? `${tomorrowItems.filter(item => item.reminderEnabled !== false && item.reminderStatus !== "Sent").length} reminder messages waiting` : "Nothing is scheduled yet"}</span></div>
        <button class="ghost-button" data-action="open-day" data-date="${tomorrow}" type="button">Open tomorrow</button>
      </section>
      <button class="text-link-button" data-action="go-settings" type="button">⚙️ Home address and reminder settings</button>
    `;
  }

  function renderSchedule() {
    subtitle.textContent = "Weekly timetable";
    const week = Array.from({ length: 7 }, (_, index) => weekDate(state.scheduleWeekOffset, index));
    const rangeLabel = `${formatDate(week[0])} – ${formatDate(week[6])}`;
    const unscheduled = unscheduledDueMembers();
    main.innerHTML = `
      <div class="schedule-title-row">
        <div><h1 class="page-title">Schedule</h1><p class="page-intro">Keep each day focused on one nearby area.</p></div>
        <button class="add-fab" data-action="schedule-contact" data-date="${dateOnly()}" type="button" aria-label="Schedule a visit">＋</button>
      </div>
      <div class="week-switcher">
        <button class="icon-button soft" data-action="change-week" data-offset="-1" type="button">←</button>
        <div><strong>${escapeHtml(rangeLabel)}</strong><span>${state.scheduleWeekOffset === 0 ? "This week" : state.scheduleWeekOffset === 1 ? "Next week" : "Selected week"}</span></div>
        <button class="icon-button soft" data-action="change-week" data-offset="1" type="button">→</button>
      </div>
      ${state.scheduleWeekOffset !== 0 ? `<button class="ghost-button button-block" data-action="this-week" type="button">Back to this week</button>` : ""}
      <div class="schedule-days">
        ${week.map(date => scheduleDayCard(date)).join("")}
      </div>
      <section class="unscheduled-panel">
        <div class="route-list-heading"><div><h2 class="section-heading">Needs a day</h2><p class="section-subtext">Members due now with no future visit booked.</p></div><span class="selected-pill">${unscheduled.length}</span></div>
        ${unscheduled.length ? unscheduled.slice(0, 12).map(record => `
          <div class="unscheduled-row">
            <button class="unscheduled-person" data-action="open-detail" data-id="${record.id}" type="button"><strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(record.address || "No address")}</span></button>
            <button class="secondary-button compact-button" data-action="schedule-record" data-id="${record.id}" data-date="${dateOnly()}" type="button">Schedule</button>
          </div>`).join("") : emptyState("✓", "Everyone has a future visit", "New due members will appear here automatically.")}
      </section>
    `;
  }

  function scheduleDayCard(date) {
    const items = appointmentsForDate(date);
    const active = items.filter(activeAppointment);
    const completed = items.filter(item => item.status === "Completed").length;
    const isToday = date === dateOnly();
    return `
      <button class="schedule-day-card ${isToday ? "today" : ""}" data-action="open-day" data-date="${date}" type="button">
        <div class="schedule-day-date"><span>${escapeHtml(dayName(date, true))}</span><strong>${new Date(`${date}T12:00:00`).getDate()}</strong></div>
        <div class="schedule-day-content">
          <strong>${active.length ? escapeHtml(dayAreaSummary(active)) : "No visits planned"}</strong>
          <span>${active.length} upcoming${completed ? ` · ${completed} completed` : ""}</span>
        </div>
        <span class="stop-chevron">›</span>
      </button>`;
  }

  function renderDay() {
    const date = state.selectedDate || dateOnly();
    subtitle.textContent = "Daily service plan";
    const items = appointmentsForDate(date);
    const active = items.filter(activeAppointment);
    const nearby = nearbyLeadsForDate(date);
    const pendingReminders = active.filter(item => item.reminderEnabled !== false && item.reminderStatus !== "Sent");
    const sameRoute = state.activeRoute?.scheduledDate === date && (state.activeRoute.phase === "return_home" || state.activeRoute.stops?.some(stop => stop.status === "pending"));
    main.innerHTML = `
      <section class="day-header-card">
        <div class="eyebrow">${escapeHtml(dayName(date, true))}</div>
        <h1>${escapeHtml(dayTitle(date))}</h1>
        <p>${active.length ? `${active.length} upcoming visit${active.length === 1 ? "" : "s"} · ${escapeHtml(dayAreaSummary(active))}` : "No visits are scheduled."}</p>
        <div class="day-header-actions">
          <button class="primary-button" data-action="${sameRoute ? "go-routes" : "start-scheduled-route"}" data-date="${date}" type="button" ${active.length ? "" : "disabled"}>${sameRoute ? "Resume Route" : "Optimise My Day"}</button>
          <button class="secondary-button" data-action="schedule-contact" data-date="${date}" type="button">＋ Add Visit</button>
        </div>
        <div class="route-end-note">📍 Starts from Rami’s location and finishes at <strong>${escapeHtml(homeLocation().label)}</strong>.</div>
      </section>

      <section class="day-section">
        <div class="route-list-heading"><h2 class="section-heading">Visits</h2><span class="selected-pill">${items.length}</span></div>
        <div class="appointment-list">${items.length ? items.map(appointmentCard).join("") : emptyState("📅", "Nothing booked", "Add a member, lead or one-time job to this day.")}</div>
      </section>

      <section class="day-section reminder-panel">
        <div class="route-list-heading"><div><h2 class="section-heading">Day-before messages</h2><p class="section-subtext">Automatic SMS sends at about ${escapeHtml(db.settings.ReminderSendTime || "17:00")} the day before once an SMS provider is connected.</p></div><span class="selected-pill">${pendingReminders.length} waiting</span></div>
        <button class="secondary-button button-block" data-action="send-day-reminders" data-date="${date}" type="button" ${pendingReminders.length ? "" : "disabled"}>Send or Preview Reminders</button>
      </section>

      <section class="day-section nearby-panel">
        <div class="route-list-heading"><div><h2 class="section-heading">Nearby leads</h2><p class="section-subtext">Useful people to offer this date when Rami calls.</p></div><span class="selected-pill">${nearby.length}</span></div>
        ${nearby.length ? nearby.map(item => `
          <div class="nearby-lead-row">
            <button class="nearby-lead-person" data-action="open-detail" data-id="${item.record.id}" type="button"><strong>${escapeHtml(item.record.name)}</strong><span>${escapeHtml(item.record.address)}${Number.isFinite(item.distance) ? ` · ${item.distance.toFixed(1)} km from this run` : ""}</span></button>
            <button class="success-button compact-button" data-action="add-nearby-lead" data-id="${item.record.id}" data-date="${date}" type="button">Add</button>
          </div>`).join("") : `<p class="muted-copy">No unscheduled leads are close enough to this day’s area yet.</p>`}
      </section>
    `;
  }

  function appointmentCard(item) {
    const record = appointmentRecord(item);
    if (!record) return "";
    const reminder = item.reminderEnabled === false ? "Reminder off" : item.reminderStatus === "Sent" ? `Reminder sent ${formatDate(item.reminderSentAt, true)}` : "Reminder waiting";
    return `
      <article class="appointment-card">
        <button class="appointment-main" data-action="open-detail" data-id="${record.id}" type="button">
          <div><div class="contact-name">${escapeHtml(record.name)}</div><div class="contact-address">${escapeHtml(record.address || "No address")}</div></div><span>›</span>
        </button>
        <div class="appointment-meta">${appointmentStatusBadge(item)}<span class="badge badge-contact">${escapeHtml(item.visitType)}</span><span class="badge badge-contact">${escapeHtml(reminder)}</span></div>
        <div class="appointment-actions">
          ${record.mobile ? `<a class="mini-action" href="tel:${escapeHtml(normalisePhone(record.mobile))}">📞 Call</a>` : ""}
          <button class="mini-action" data-action="preview-reminder" data-appointment-id="${item.id}" type="button">💬 Message</button>
          <button class="mini-action" data-action="move-appointment" data-appointment-id="${item.id}" type="button">📅 Move</button>
          ${activeAppointment(item) ? `<button class="mini-action danger-text" data-action="cancel-appointment" data-appointment-id="${item.id}" type="button">Cancel</button>` : ""}
        </div>
      </article>`;
  }

  function renderSettings() {
    subtitle.textContent = "App settings";
    main.innerHTML = `
      <h1 class="page-title">Settings</h1>
      <p class="page-intro">These are normally set once and left alone.</p>
      <form id="appSettingsForm" class="settings-card form-grid">
        <div class="form-field"><label for="homeAddress">Finish every route at</label><input id="homeAddress" name="HomeAddress" value="${escapeHtml(db.settings.HomeAddress || "")}" /></div>
        <div class="form-field two-column-field"><div><label for="homeLat">Home latitude</label><input id="homeLat" name="HomeLatitude" inputmode="decimal" value="${escapeHtml(db.settings.HomeLatitude || "")}" /></div><div><label for="homeLng">Home longitude</label><input id="homeLng" name="HomeLongitude" inputmode="decimal" value="${escapeHtml(db.settings.HomeLongitude || "")}" /></div></div>
        <div class="form-hint">The current values point to the saved Rosehill location. Change these only when Rami confirms his preferred finishing address.</div>
        <div class="form-field"><label for="reminderTime">Day-before reminder time</label><input id="reminderTime" name="ReminderSendTime" type="time" value="${escapeHtml(db.settings.ReminderSendTime || "17:00")}" /></div>
        <div class="form-field"><label for="nearbyDays">Look ahead for nearby lead suggestions</label><select id="nearbyDays" name="NearbyLeadSearchDays"><option value="7" ${String(db.settings.NearbyLeadSearchDays) === "7" ? "selected" : ""}>7 days</option><option value="14" ${String(db.settings.NearbyLeadSearchDays || "14") === "14" ? "selected" : ""}>14 days</option><option value="21" ${String(db.settings.NearbyLeadSearchDays) === "21" ? "selected" : ""}>21 days</option></select></div>
        <div class="form-field"><label for="smsTemplate">Reminder message</label><textarea id="smsTemplate" name="SMSMessageTemplate" rows="9">${escapeHtml(db.settings.SMSMessageTemplate || "")}</textarea><div class="form-hint">Use {firstName} where the customer’s first name should appear.</div></div>
        <button class="primary-button button-block" type="submit">Save Settings</button>
      </form>`;
  }

  function renderDetail() {
    const record = findRecord(state.detailId);
    if (!record) return navigate("home");
    subtitle.textContent = categoryLabel(record);
    const phone = normalisePhone(record.mobile);
    const galleryPhotos = collectRecordPhotos(record);
    const timeline = [...(record.timeline || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const future = futureAppointmentsForContact(record.id);
    const suggestion = ["lead", "one_time"].includes(record.category) ? bestUpcomingAreaForRecord(record) : null;

    main.innerHTML = `
      <section class="detail-header">
        <div class="contact-meta"><span class="badge ${badgeClass(record)}">${escapeHtml(categoryLabel(record))}</span>${isDue(record) ? `<span class="badge badge-due">Due now</span>` : ""}${record.paused ? `<span class="badge badge-past">Paused</span>` : ""}</div>
        <h1 class="detail-name">${escapeHtml(record.name || "Unnamed contact")}</h1>
        <p class="detail-address">${escapeHtml(record.address || "No address added")}</p>
        <div class="detail-actions">
          ${phone ? `<a class="action-link" href="tel:${escapeHtml(phone)}"><span class="action-icon">📞</span><span>Call</span></a>` : `<button class="action-link disabled" type="button" disabled><span class="action-icon">📞</span><span>No phone</span></button>`}
          ${record.address ? `<a class="action-link" href="${mapsDirectionUrl(record)}" target="_blank" rel="noopener"><span class="action-icon">🗺️</span><span>Navigate</span></a>` : `<button class="action-link disabled" type="button" disabled><span class="action-icon">🗺️</span><span>No address</span></button>`}
          <button class="action-link" data-action="save-vcard" data-id="${record.id}" type="button"><span class="action-icon">📇</span><span>Save to phone</span></button>
          <button class="action-link" data-action="edit-record" data-id="${record.id}" type="button"><span class="action-icon">✏️</span><span>Edit</span></button>
        </div>
        <div class="detail-info">
          <div class="info-box"><span>Mobile</span><strong>${escapeHtml(record.mobile || "Not added")}</strong></div>
          <div class="info-box"><span>Usual repeat</span><strong>${record.defaultRepeatWeeks ? `Every ${record.defaultRepeatWeeks} weeks` : "No automatic repeat"}</strong></div>
          <div class="info-box"><span>Last visit</span><strong>${formatDate(record.lastVisit)}</strong></div>
          <div class="info-box"><span>Next visit</span><strong>${future[0] ? formatDate(future[0].scheduledDate) : "Not scheduled"}</strong></div>
        </div>
      </section>

      ${suggestion ? `<section class="nearby-suggestion-card"><div class="suggestion-icon">📍</div><div><span>NEXT NEARBY RUN</span><strong>${escapeHtml(suggestion.area)} · ${formatDate(suggestion.date)}</strong><p>${suggestion.items.length} visit${suggestion.items.length === 1 ? "" : "s"} already planned${Number.isFinite(suggestion.distance) ? ` · about ${suggestion.distance.toFixed(1)} km away` : ""}</p></div><button class="success-button" data-action="schedule-record" data-id="${record.id}" data-date="${suggestion.date}" type="button">Add to this day</button></section>` : ""}
      ${future.length ? `<section class="upcoming-appointments"><div class="route-list-heading"><h2 class="section-heading">Upcoming visits</h2><span class="selected-pill">${future.length}</span></div>${future.slice(0, 4).map(item => `<button class="upcoming-appointment-row" data-action="open-day" data-date="${item.scheduledDate}" type="button"><div><strong>${formatDate(item.scheduledDate)}</strong><span>${escapeHtml(item.areaLabel || areaForRecord(record))}</span></div>${appointmentStatusBadge(item)}<span>›</span></button>`).join("")}</section>` : ""}
      ${leadActions(record)}

      <section class="timeline-wrap">
        <div class="timeline-heading-row"><h2 class="section-heading">Photos and notes ${galleryPhotos.length ? `(${galleryPhotos.length})` : ""}</h2>${galleryPhotos.length ? `<button class="ghost-button compact-button" data-action="open-gallery" data-id="${record.id}" data-photo-index="${Math.max(0, galleryPhotos.length - 1)}" type="button">View photos</button>` : ""}</div>
        <div class="timeline">${timeline.length ? timeline.map(entry => timelineEntry(record, entry)).join("") : emptyState("📷", "No photos or notes yet", "Tap the camera below to take the first photo.")}</div>
      </section>
      <div class="composer"><button class="composer-button" data-action="photo-menu" data-id="${record.id}" type="button" aria-label="Add photo">📷</button><textarea id="messageText" rows="1" placeholder="Write or dictate a note..."></textarea><button class="composer-button" data-action="voice-note" type="button" aria-label="Dictate note">🎤</button><button class="composer-button composer-send" data-action="send-note" data-id="${record.id}" type="button">Send</button></div>`;
  }

  function leadActions(record) {
    const scheduleButton = `<button class="secondary-button button-block" data-action="schedule-record" data-id="${record.id}" data-date="${futureAppointmentsForContact(record.id)[0]?.scheduledDate || dateOnly()}" type="button">📅 Schedule a visit</button>`;
    if (record.category === "lead") return `<section class="lead-action-panel">${scheduleButton}${record.leadStage !== "called" ? `<button class="secondary-button button-block" data-action="mark-called" data-id="${record.id}" type="button">✓ Mark as called</button>` : `<div class="badge badge-called">✓ Called</div>`}<button class="primary-button button-block" data-action="book-one-time" data-id="${record.id}" type="button">Book one-time job</button><button class="success-button button-block" data-action="convert-member" data-id="${record.id}" type="button">Convert to member</button><button class="ghost-button button-block" data-action="not-proceeding" data-id="${record.id}" type="button">Not proceeding</button></section>`;
    if (record.category === "one_time") return `<section class="lead-action-panel">${scheduleButton}<button class="success-button button-block" data-action="complete-one-time" data-id="${record.id}" type="button">✓ Complete one-time job</button><button class="secondary-button button-block" data-action="convert-member" data-id="${record.id}" type="button">Make this person a member</button></section>`;
    if (["past", "contact", "not_proceeding"].includes(record.category)) return `<section class="lead-action-panel">${scheduleButton}<button class="primary-button button-block" data-action="make-lead" data-id="${record.id}" type="button">Make active lead</button><button class="success-button button-block" data-action="convert-member" data-id="${record.id}" type="button">Make member</button></section>`;
    if (record.category === "member") return `<section class="lead-action-panel">${scheduleButton}<button class="primary-button button-block" data-action="quick-add-route" data-id="${record.id}" type="button">Add to a route now</button></section>`;
    return "";
  }

  function openAddForm(category) {
    const title = category === "member" ? "Add Member" : category === "contact" ? "Save Contact" : "Add Lead";
    showModal(`
      <div class="modal-header"><div><h2>${title}</h2><p>Only the name and mobile are required.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <form id="addRecordForm" class="form-grid" data-category="${category}">
        <div class="form-field"><label for="addName">Name *</label><input id="addName" name="name" required autocomplete="name" /></div>
        <div class="form-field"><label for="addMobile">Mobile *</label><input id="addMobile" name="mobile" required inputmode="tel" autocomplete="tel" /></div>
        <div class="form-field"><label for="addAddress">Address</label><input id="addAddress" name="address" autocomplete="street-address" placeholder="Full service address" /></div>
        <div class="form-field"><label for="addSuburb">Suburb</label><input id="addSuburb" name="suburb" autocomplete="address-level2" /></div>
        <div class="form-field"><label for="addEmail">Email (optional)</label><input id="addEmail" name="email" type="email" autocomplete="email" /></div>
        <div class="form-field"><label for="addService">Service or note (optional)</label><textarea id="addService" name="service"></textarea></div>
        ${category === "member" ? `<div class="form-field"><label for="addRepeat">Usual visit cycle</label><select id="addRepeat" name="defaultRepeatWeeks"><option value="4" selected>Every 4 weeks</option><option value="2">Every 2 weeks</option><option value="0">Choose each time</option></select></div><div class="form-field"><label for="addFirstVisit">First scheduled visit (optional)</label><input id="addFirstVisit" name="firstVisit" type="date" /></div>` : ""}
        <label class="checkbox-field"><input name="smsRemindersEnabled" type="checkbox" checked /><span>Send day-before reminder messages</span></label>
        <button class="primary-button button-block" type="submit">Save</button>
      </form>`);
  }

  function openEditForm(recordId) {
    const record = findRecord(recordId);
    if (!record) return;
    showModal(`
      <div class="modal-header"><div><h2>Edit details</h2><p>Change only what needs updating.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <form id="editRecordForm" class="form-grid" data-record-id="${record.id}">
        <div class="form-field"><label for="editName">Name *</label><input id="editName" name="name" required value="${escapeHtml(record.name || "")}" /></div>
        <div class="form-field"><label for="editMobile">Mobile</label><input id="editMobile" name="mobile" inputmode="tel" value="${escapeHtml(record.mobile || "")}" /></div>
        <div class="form-field"><label for="editAddress">Address</label><input id="editAddress" name="address" value="${escapeHtml(record.address || "")}" /></div>
        <div class="form-field"><label for="editSuburb">Suburb</label><input id="editSuburb" name="suburb" value="${escapeHtml(record.suburb || "")}" /></div>
        <div class="form-field"><label for="editEmail">Email</label><input id="editEmail" name="email" type="email" value="${escapeHtml(record.email || "")}" /></div>
        <div class="form-field"><label for="editService">Service or note</label><textarea id="editService" name="service">${escapeHtml(record.service || "")}</textarea></div>
        ${record.category === "member" ? `<div class="form-field"><label for="editRepeat">Usual visit cycle</label><select id="editRepeat" name="defaultRepeatWeeks"><option value="4" ${Number(record.defaultRepeatWeeks) === 4 ? "selected" : ""}>Every 4 weeks</option><option value="2" ${Number(record.defaultRepeatWeeks) === 2 ? "selected" : ""}>Every 2 weeks</option><option value="0" ${!Number(record.defaultRepeatWeeks) ? "selected" : ""}>Choose each time</option></select></div>` : ""}
        <label class="checkbox-field"><input name="smsRemindersEnabled" type="checkbox" ${record.smsRemindersEnabled !== false ? "checked" : ""} /><span>Send day-before reminder messages</span></label>
        ${record.category === "member" ? `<label class="checkbox-field"><input name="paused" type="checkbox" ${record.paused ? "checked" : ""} /><span>Pause regular visits</span></label>` : ""}
        <button class="primary-button button-block" type="submit">Save changes</button>
      </form>`);
  }

  function submitAddForm(form) {
    const data = new FormData(form);
    const category = form.dataset.category || "lead";
    const name = String(data.get("name") || "").trim();
    const mobile = String(data.get("mobile") || "").trim();
    if (!name || !mobile) return showToast("Name and mobile are required.");
    const address = String(data.get("address") || "").trim();
    const record = {
      id: uid(category === "member" ? "MEM" : category === "contact" ? "CONTACT" : "LEAD"), category,
      leadStage: category === "lead" ? "new" : "", name, mobile,
      email: String(data.get("email") || "").trim(), address, suburb: String(data.get("suburb") || "").trim(), postcode: "",
      lat: null, lng: null, streetKey: deriveStreetKey(address), service: String(data.get("service") || "").trim(),
      callback: category === "lead" ? "Manual lead" : "", createdAt: isoNow(), lastVisit: "", nextVisit: "",
      defaultRepeatWeeks: category === "member" ? Number(data.get("defaultRepeatWeeks")) || 0 : 0,
      smsRemindersEnabled: data.get("smsRemindersEnabled") === "on", preferredDay: "", paused: false,
      timeline: [{ id: uid("TL"), type: "system", text: `${categoryLabel({ category, leadStage: category === "lead" ? "new" : "" })} added manually.`, createdAt: isoNow(), photos: [] }]
    };
    db.records.unshift(record);
    const firstVisit = String(data.get("firstVisit") || "");
    if (firstVisit) createAppointment(record.id, firstVisit, { repeatWeeks: record.defaultRepeatWeeks });
    saveDatabase(); closeModal(); navigate("detail", { detailId: record.id }); showToast(`${name} saved.`);
  }

  function submitEditForm(form) {
    const record = findRecord(form.dataset.recordId);
    if (!record) return;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) return showToast("Name is required.");
    const previousAddress = record.address || "";
    record.name = name; record.mobile = String(data.get("mobile") || "").trim();
    record.address = String(data.get("address") || "").trim(); record.suburb = String(data.get("suburb") || "").trim();
    record.email = String(data.get("email") || "").trim(); record.service = String(data.get("service") || "").trim();
    record.smsRemindersEnabled = data.get("smsRemindersEnabled") === "on";
    if (record.category === "member") {
      record.defaultRepeatWeeks = Number(data.get("defaultRepeatWeeks")) || 0;
      record.paused = data.get("paused") === "on";
    }
    if (record.address !== previousAddress) { record.streetKey = deriveStreetKey(record.address); record.lat = null; record.lng = null; }
    addSystemEntry(record, "Contact details updated."); saveDatabase(); closeModal(); renderDetail(); showToast("Details updated.");
  }

  function openScheduleForm(recordId = "", defaultDate = dateOnly()) {
    const record = recordId ? findRecord(recordId) : null;
    const choices = db.records.filter(item => !["not_proceeding"].includes(item.category)).sort((a, b) => a.name.localeCompare(b.name));
    showModal(`
      <div class="modal-header"><div><h2>Schedule a visit</h2><p>Choose the person and day.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div>
      <form id="scheduleVisitForm" class="form-grid">
        <div class="form-field"><label for="scheduleContact">Customer or lead</label><select id="scheduleContact" name="contactId" required>${choices.map(item => `<option value="${item.id}" ${item.id === recordId ? "selected" : ""}>${escapeHtml(item.name)} — ${escapeHtml(areaForRecord(item))}</option>`).join("")}</select></div>
        <div class="form-field"><label for="scheduleDate">Date</label><input id="scheduleDate" name="scheduledDate" type="date" required value="${escapeHtml(defaultDate)}" /></div>
        <div class="form-field"><label for="scheduleRepeat">After completion</label><select id="scheduleRepeat" name="repeatWeeks"><option value="0">Ask me each time</option><option value="2" ${Number(record?.defaultRepeatWeeks) === 2 ? "selected" : ""}>Suggest 2 weeks later</option><option value="4" ${Number(record?.defaultRepeatWeeks || 4) === 4 ? "selected" : ""}>Suggest 4 weeks later</option></select></div>
        <label class="checkbox-field"><input name="reminderEnabled" type="checkbox" ${record?.smsRemindersEnabled === false ? "" : "checked"} /><span>Send day-before reminder</span></label>
        <button class="primary-button button-block" type="submit">Add to Schedule</button>
      </form>`);
  }

  function openMoveAppointment(appointmentId) {
    const item = db.appointments.find(entry => entry.id === appointmentId);
    if (!item) return;
    showModal(`<div class="modal-header"><div><h2>Move visit</h2><p>${escapeHtml(appointmentName(item))}</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div><form id="moveAppointmentForm" class="form-grid" data-appointment-id="${item.id}"><div class="form-field"><label for="moveDate">New date</label><input id="moveDate" name="scheduledDate" type="date" required value="${escapeHtml(item.scheduledDate)}" /></div><button class="primary-button button-block" type="submit">Move Visit</button></form>`);
  }

  function openReminderPreview(appointmentId) {
    const item = db.appointments.find(entry => entry.id === appointmentId);
    const record = appointmentRecord(item);
    if (!item || !record) return;
    showModal(`<div class="modal-header"><div><h2>Reminder message</h2><p>${escapeHtml(record.name)} · ${formatDate(item.scheduledDate)}</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div><div class="sms-preview">${escapeHtml(reminderMessage(record)).replace(/\n/g, "<br>")}</div><div class="button-stack"><button class="primary-button button-block" data-action="send-one-reminder" data-appointment-id="${item.id}" type="button">Send SMS</button><button class="secondary-button button-block" data-action="copy-reminder" data-appointment-id="${item.id}" type="button">Copy Message</button><a class="ghost-button button-block center-link" href="sms:${escapeHtml(normalisePhone(record.mobile))}?&body=${encodeURIComponent(reminderMessage(record))}">Open Phone Messages</a></div>`);
  }

  async function copyReminder(appointmentId) {
    const item = db.appointments.find(entry => entry.id === appointmentId);
    const record = appointmentRecord(item);
    if (!record) return;
    try { await navigator.clipboard.writeText(reminderMessage(record)); showToast("Reminder copied."); }
    catch { showToast("Could not copy automatically. Press and hold the message instead."); }
  }

  async function sendReminders({ appointmentIds = [], scheduledDate = "" }) {
    showToast("Checking reminder service…");
    try {
      const response = await fetch(`${API_BASE}/api/reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ appointmentIds, scheduledDate }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not send reminders.");
      if (!result.configured) {
        const first = result.previews?.[0];
        if (first) {
          closeModal();
          const item = db.appointments.find(entry => entry.id === first.appointmentId);
          if (item) openReminderPreview(item.id);
        }
        showToast("SMS provider is not connected yet. The message is ready to copy.");
        return;
      }
      (result.sent || []).forEach(sent => {
        const item = db.appointments.find(entry => entry.id === sent.appointmentId);
        if (item) { item.reminderStatus = "Sent"; item.reminderSentAt = sent.sentAt; item.reminderProviderId = sent.providerId || ""; }
      });
      saveDatabase(); closeModal(); render();
      showToast(`${result.sent?.length || 0} reminder${result.sent?.length === 1 ? "" : "s"} sent.`);
    } catch (error) { console.error(error); showToast(error.message || "Could not send reminders."); }
  }

  function openRepeatChoice(record, completedAppointment) {
    if (!record || record.category !== "member" || record.paused) return;
    const preferred = Number(completedAppointment?.repeatWeeks || record.defaultRepeatWeeks || 4);
    showModal(`<div class="modal-header"><div><h2>When should ${escapeHtml(record.name.split(" ")[0] || record.name)} appear again?</h2><p>The next visit is added to the timetable automatically.</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div><div class="repeat-choice-grid"><button class="choice-button ${preferred === 2 ? "recommended" : ""}" data-action="repeat-after-complete" data-id="${record.id}" data-weeks="2" type="button"><span class="choice-icon">2</span><div><strong>2 Weeks</strong><span>${formatDate(addDays(dateOnly(), 14))}</span></div></button><button class="choice-button ${preferred === 4 ? "recommended" : ""}" data-action="repeat-after-complete" data-id="${record.id}" data-weeks="4" type="button"><span class="choice-icon">4</span><div><strong>4 Weeks</strong><span>${formatDate(addDays(dateOnly(), 28))}</span></div></button><button class="choice-button" data-action="custom-repeat-date" data-id="${record.id}" type="button"><span class="choice-icon">📅</span><div><strong>Choose Date</strong><span>Pick any future day</span></div></button><button class="choice-button" data-action="no-repeat" data-id="${record.id}" type="button"><span class="choice-icon">—</span><div><strong>Not Yet</strong><span>Leave this member unscheduled</span></div></button></div>`);
  }

  function createRepeatAppointment(recordId, weeks) {
    const record = findRecord(recordId);
    if (!record) return;
    const item = createAppointment(recordId, addDays(dateOnly(), Number(weeks) * 7), { repeatWeeks: Number(weeks) });
    record.defaultRepeatWeeks = Number(weeks);
    saveDatabase(); closeModal(); render(); showToast(`Next visit scheduled for ${formatDate(item.scheduledDate)}.`);
  }

  function openCustomRepeatDate(recordId) {
    const record = findRecord(recordId);
    if (!record) return;
    showModal(`<div class="modal-header"><div><h2>Choose next visit</h2><p>${escapeHtml(record.name)}</p></div><button class="modal-close" data-action="close-modal" type="button">×</button></div><form id="customRepeatForm" class="form-grid" data-record-id="${record.id}"><div class="form-field"><label for="customRepeatDate">Date</label><input id="customRepeatDate" name="scheduledDate" type="date" min="${dateOnly()}" required value="${addDays(dateOnly(), 28)}" /></div><button class="primary-button button-block" type="submit">Schedule Next Visit</button></form>`);
  }

  function updateCategory(recordId, category, message) {
    const record = findRecord(recordId);
    if (!record) return;
    record.category = category;
    if (category === "member") { record.leadStage = ""; record.defaultRepeatWeeks = record.defaultRepeatWeeks || 4; }
    if (category === "lead") record.leadStage = "new";
    addSystemEntry(record, message); saveDatabase(); renderDetail(); showToast(message);
  }

  function renderRoutes() {
    subtitle.textContent = "Daily route";
    if (state.manualRouteMode && !state.activeRoute) return renderManualRouteBuilder();
    if (state.activeRoute && (state.activeRoute.phase === "return_home" || state.activeRoute.stops.some(stop => stop.status === "pending"))) return renderActiveRoute();
    const todayItems = appointmentsForDate(dateOnly()).filter(activeAppointment);
    main.innerHTML = `
      <h1 class="page-title">Today’s Route</h1><p class="page-intro">The best route comes from the timetable. It starts wherever Rami is and finishes at home.</p>
      <section class="route-builder-card"><div class="location-status"><div class="location-dot ${todayItems.length ? "ready" : ""}"></div><div><strong>${todayItems.length ? `${todayItems.length} visit${todayItems.length === 1 ? "" : "s"} scheduled today` : "Nothing scheduled today"}</strong><span>${todayItems.length ? escapeHtml(dayAreaSummary(todayItems)) : "Open Schedule to add visits first."}</span></div></div><div class="button-stack"><button class="success-button button-block" data-action="start-scheduled-route" data-date="${dateOnly()}" type="button" ${todayItems.length ? "" : "disabled"}>📍 Use My Location and Optimise</button><button class="secondary-button button-block" data-action="open-day" data-date="${dateOnly()}" type="button">Open Today’s Schedule</button><button class="ghost-button button-block" data-action="open-manual-route" type="button">Build an Unplanned Route</button></div><div class="route-end-note">Finish: <strong>${escapeHtml(homeLocation().label)}</strong></div></section>`;
  }

  function renderManualRouteBuilder() {
    const type = state.routeType;
    const routeQuery = state.queries.routes.trim().toLowerCase();
    let candidates = type === "member" ? db.records.filter(record => record.category === "member") : db.records.filter(record => ["lead", "one_time"].includes(record.category));
    if (routeQuery) candidates = candidates.filter(record => recordSearchText(record).includes(routeQuery));
    main.innerHTML = `<h1 class="page-title">Unplanned Route</h1><p class="page-intro">For unexpected visits that are not on the timetable.</p><div class="route-type-tabs"><button class="route-type-tab ${type === "member" ? "active" : ""}" data-action="set-route-type" data-route-type="member" type="button">Members</button><button class="route-type-tab ${type === "lead" ? "active" : ""}" data-action="set-route-type" data-route-type="lead" type="button">Leads</button></div><section class="route-builder-card"><div class="button-row"><button class="secondary-button" data-action="select-route-defaults" type="button">${type === "member" ? "Select due" : "Select active leads"}</button><button class="secondary-button" data-action="clear-route-selection" type="button">Clear</button></div><div class="location-status"><div class="location-dot ${state.routeStart ? "ready" : ""}"></div><div><strong>${state.routeStart ? "Starting location ready" : "Starting location needed"}</strong><span>${state.routeStart ? escapeHtml(state.routeStart.label) : "Use the phone location."}</span></div></div><div class="button-stack"><button class="primary-button button-block" data-action="use-current-location" type="button">📍 Use My Current Location</button><button class="secondary-button button-block" data-action="use-saved-start" type="button">Use Saved Rosehill Start</button></div><div class="route-list-heading"><h2 class="section-heading">Choose stops</h2><span class="selected-pill">${state.routeSelections.size} selected</span></div><div class="search-box route-search"><input id="routeSearch" value="${escapeHtml(state.queries.routes)}" placeholder="Search this list" /><span>🔎</span></div><div class="route-candidate-list">${candidates.map(routeSelectionRow).join("")}</div><button class="success-button button-block sticky-build-button" data-action="build-route" type="button">Build Route (${state.routeSelections.size})</button></section>`;
  }

  function renderActiveRoute() {
    const route = state.activeRoute;
    const pending = route.stops.filter(stop => stop.status === "pending");
    const finished = route.stops.filter(stop => stop.status !== "pending");
    if (!pending.length || route.phase === "return_home") {
      const home = route.end || homeLocation();
      main.innerHTML = `<h1 class="page-title">Return Home</h1><section class="active-route-card return-home-card"><div class="return-home-icon">🏠</div><h2>Customer visits are finished</h2><p>Google Maps can now take Rami back to ${escapeHtml(home.label || "home")}.</p><a class="primary-button button-block" href="${mapsHomeUrl(route.currentLocation, home)}" target="_blank" rel="noopener">🗺 Navigate Home</a><button class="success-button button-block" data-action="complete-return-home" type="button">Finish Today’s Run</button><details class="completed-stops"><summary>Visits completed (${finished.length})</summary><div>${finished.map(stop => { const item = findRecord(stop.recordId); return `<div class="completed-stop-row"><span>${escapeHtml(item?.name || "Unknown")}</span><strong>${stop.status === "done" ? "Done" : "Skipped"}</strong></div>`; }).join("")}</div></details></section>`;
      return;
    }
    const nextStop = pending[0];
    const record = findRecord(nextStop.recordId);
    if (!record) return finishRoute();
    const completedCount = finished.length;
    const percent = route.stops.length ? Math.round((completedCount / route.stops.length) * 100) : 0;
    const distance = estimateDistanceFromStart(route, nextStop);
    main.innerHTML = `<h1 class="page-title">${route.scheduledDate ? dayTitle(route.scheduledDate) : "Active Route"}</h1><section class="active-route-card"><div class="route-progress"><div class="route-progress-row"><span>${completedCount} of ${route.stops.length} completed</span><span>${percent}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div></div><div class="next-stop"><div class="next-stop-label">NEXT STOP</div><h2>${escapeHtml(record.name)}</h2><p>${escapeHtml(record.address || "No address added")}</p>${distance ? `<p style="margin-top:8px"><strong>About ${distance}</strong> away</p>` : ""}</div><div class="button-stack" style="margin-top:14px">${record.address ? `<a class="primary-button button-block" href="${mapsDirectionUrl(record, route.currentLocation)}" target="_blank" rel="noopener">🗺 Start Google Maps</a>` : `<button class="primary-button button-block" type="button" disabled>Address needed for Maps</button>`}${record.mobile ? `<a class="secondary-button button-block" href="tel:${escapeHtml(normalisePhone(record.mobile))}">📞 Call ${escapeHtml(record.name.split(" ")[0] || "customer")}</a>` : ""}<button class="secondary-button button-block" data-action="open-route-contact" data-id="${record.id}" type="button">View photos and notes</button><div class="button-row"><button class="secondary-button" data-action="skip-route-stop" type="button">Skip</button><button class="success-button" data-action="complete-route-stop" type="button">Done</button></div></div><button class="ghost-button button-block" style="margin-top:7px" data-action="refresh-route-location" type="button">📍 Recalculate from my location</button><button class="ghost-button button-block" data-action="finish-route" type="button">End route</button><div class="route-list-heading"><h2 class="section-heading">Upcoming stops</h2><span class="selected-pill">${pending.length} left</span></div><div class="route-stop-list">${pending.map((stop, index) => { const item = findRecord(stop.recordId); return `<button class="route-stop-mini route-stop-button" data-action="open-route-contact" data-id="${item?.id || ""}" type="button"><div class="stop-number">${index + 1}</div><div><strong>${escapeHtml(item?.name || "Unknown")}</strong><span>${escapeHtml(item?.address || "")}</span></div><div class="stop-chevron">›</div></button>`; }).join("")}</div></section>`;
  }

  function mapsHomeUrl(origin, home) {
    const originPart = origin && Number.isFinite(Number(origin.lat)) ? `&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}` : "";
    const destination = Number.isFinite(Number(home?.lat)) ? `${home.lat},${home.lng}` : home?.label || db.settings.HomeAddress;
    return `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  }

  async function startScheduledRoute(date) {
    const items = appointmentsForDate(date).filter(activeAppointment);
    if (!items.length) return showToast("There are no visits to route on this day.");
    const proceed = start => buildRouteFromAppointments(items, date, start);
    if (!navigator.geolocation) return proceed({ ...CONFIG.defaultStartCoordinates, label: "Saved Rosehill start" });
    showToast("Finding Rami’s location…");
    navigator.geolocation.getCurrentPosition(position => proceed({ lat: position.coords.latitude, lng: position.coords.longitude, label: "Current phone location" }), () => { showToast("Location was unavailable. Using the saved Rosehill start."); proceed({ ...CONFIG.defaultStartCoordinates, label: "Saved Rosehill start" }); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  async function buildRouteFromAppointments(items, date, start) {
    const records = items.map(appointmentRecord).filter(Boolean);
    const appointmentByRecord = new Map(items.map(item => [item.contactId, item]));
    const end = homeLocation();
    const ordered = await optimiseRouteOrder(records, start, end);
    ordered.forEach((record, index) => { const item = appointmentByRecord.get(record.id); if (item) { item.routeOrder = index + 1; item.updatedAt = isoNow(); } });
    state.activeRoute = { id: uid("ROUTE"), type: "schedule", scheduledDate: date, createdAt: isoNow(), start: { ...start }, currentLocation: { ...start }, end, phase: "visits", stops: ordered.map(record => ({ recordId: record.id, appointmentId: appointmentByRecord.get(record.id)?.id || "", status: "pending" })) };
    db.activeRoute = state.activeRoute; saveDatabase(); navigate("routes"); showToast("Route optimised to finish at home.");
  }

  async function optimiseRouteOrder(records, start, end) {
    if (records.length <= 25 && records.every(record => record.address || hasCoords(record))) {
      try {
        const response = await fetch(`${API_BASE}/api/route-optimize`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ origin: start, destination: end, stops: records.map(record => ({ lat: record.lat, lng: record.lng, address: record.address })) }) });
        const result = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(result.order) && result.order.length === records.length) return result.order.map(index => records[index]).filter(Boolean);
      } catch (error) { console.warn("Google route optimisation unavailable; using local cycle optimiser.", error); }
    }
    return optimiseRecords(records, start, end);
  }

  function routeCost(records, start, end) {
    let current = start;
    let cost = 0;
    records.forEach(record => { if (hasCoords(record)) { const next = { lat: Number(record.lat), lng: Number(record.lng) }; cost += haversineKm(current, next); current = next; } });
    if (end && Number.isFinite(Number(end.lat))) cost += haversineKm(current, end);
    return cost;
  }

  function optimiseRecords(records, start, end = homeLocation()) {
    const located = records.filter(hasCoords);
    const unlocated = records.filter(record => !hasCoords(record));
    const groupsMap = new Map();
    located.forEach(record => { const key = record.streetKey || deriveStreetKey(record.address) || record.id; if (!groupsMap.has(key)) groupsMap.set(key, []); groupsMap.get(key).push(record); });
    const groups = [...groupsMap.values()].map(items => ({ items, centroid: { lat: items.reduce((sum, item) => sum + Number(item.lat), 0) / items.length, lng: items.reduce((sum, item) => sum + Number(item.lng), 0) / items.length } }));
    const ordered = []; let current = { lat: Number(start.lat), lng: Number(start.lng) }; const remaining = groups.slice();
    while (remaining.length) {
      let bestIndex = 0; let bestScore = Infinity;
      remaining.forEach((group, index) => {
        const toward = haversineKm(current, group.centroid);
        const homePull = end ? haversineKm(group.centroid, end) * (remaining.length <= 2 ? 0.35 : 0.08) : 0;
        const score = toward + homePull;
        if (score < bestScore) { bestScore = score; bestIndex = index; }
      });
      const group = remaining.splice(bestIndex, 1)[0]; const seq = orderStreetGroup(group.items, current); ordered.push(...seq); const last = seq[seq.length - 1]; current = { lat: Number(last.lat), lng: Number(last.lng) };
    }
    let improved = ordered.slice();
    for (let pass = 0; pass < 5; pass += 1) {
      let changed = false;
      for (let i = 0; i < improved.length - 1; i += 1) {
        for (let k = i + 1; k < improved.length; k += 1) {
          const candidate = improved.slice(0, i).concat(improved.slice(i, k + 1).reverse(), improved.slice(k + 1));
          if (routeCost(candidate, start, end) + 0.01 < routeCost(improved, start, end)) { improved = candidate; changed = true; }
        }
      }
      if (!changed) break;
    }
    return improved.concat(unlocated.sort((a, b) => a.name.localeCompare(b.name)));
  }

  function buildRoute() {
    const records = [...state.routeSelections].map(findRecord).filter(Boolean);
    if (!records.length) return showToast("Select at least one stop.");
    if (!state.routeStart) return showToast("Tap Use My Current Location first.");
    optimiseRouteOrder(records, state.routeStart, homeLocation()).then(ordered => {
      state.activeRoute = { id: uid("ROUTE"), type: state.routeType, createdAt: isoNow(), start: { ...state.routeStart }, currentLocation: { ...state.routeStart }, end: homeLocation(), phase: "visits", stops: ordered.map(record => ({ recordId: record.id, appointmentId: "", status: "pending" })) };
      state.routeSelections.clear(); saveDatabase(); renderRoutes(); showToast("Route ready and set to finish at home.");
    });
  }

  function refreshActiveRouteLocation() {
    const route = state.activeRoute;
    if (!route || !navigator.geolocation) return showToast("Current location is not available on this device.");
    showToast("Updating route from the current location…");
    navigator.geolocation.getCurrentPosition(async position => {
      route.currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      const pending = route.stops.filter(stop => stop.status === "pending");
      const records = pending.map(stop => findRecord(stop.recordId)).filter(Boolean);
      const ordered = await optimiseRouteOrder(records, route.currentLocation, route.end || homeLocation());
      const statusById = new Map(pending.map(stop => [stop.recordId, stop]));
      route.stops = route.stops.filter(stop => stop.status !== "pending").concat(ordered.map(record => statusById.get(record.id) || { recordId: record.id, appointmentId: "", status: "pending" }));
      saveDatabase(); renderRoutes(); showToast("Remaining stops recalculated with the trip home included.");
    }, () => showToast("Could not update the current location."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  }

  async function completeCurrentStop(skip = false) {
    const route = state.activeRoute; if (!route) return;
    const stop = route.stops.find(item => item.status === "pending"); if (!stop) return;
    stop.status = skip ? "skipped" : "done";
    const record = findRecord(stop.recordId);
    const appointment = db.appointments.find(item => item.id === stop.appointmentId);
    if (appointment) { appointment.status = skip ? "Skipped" : "Completed"; appointment.updatedAt = isoNow(); }
    if (record && appointment) syncRecordNextVisit(record.id);
    if (record && !skip) {
      record.lastVisit = dateOnly();
      if (record.category === "one_time") record.category = "past";
      addSystemEntry(record, record.category === "past" ? "One-time job completed." : "Visit completed.");
      syncRecordNextVisit(record.id);
    }
    if (record && hasCoords(record)) route.currentLocation = { lat: Number(record.lat), lng: Number(record.lng) };
    const remaining = route.stops.filter(item => item.status === "pending");
    if (!remaining.length) route.phase = "return_home";
    else {
      const records = remaining.map(item => findRecord(item.recordId)).filter(Boolean);
      const ordered = await optimiseRouteOrder(records, route.currentLocation, route.end || homeLocation());
      const byRecord = new Map(remaining.map(item => [item.recordId, item]));
      route.stops = route.stops.filter(item => item.status !== "pending").concat(ordered.map(item => byRecord.get(item.id)));
    }
    saveDatabase(); renderRoutes();
    if (record && !skip && record.category === "member") openRepeatChoice(record, appointment);
    else showToast(skip ? "Stop skipped." : remaining.length ? "Visit completed. Route updated." : "Visits finished. Navigate home.");
  }

  function completeReturnHome() {
    const route = state.activeRoute;
    if (route) { route.phase = "completed"; route.completedAt = isoNow(); db.routeHistory.unshift({ ...route }); }
    state.activeRoute = null; db.activeRoute = null; saveDatabase(); navigate("home"); showToast("Today’s run completed.");
  }

  function quickAddRoute(recordId) {
    state.routeType = findRecord(recordId)?.category === "member" ? "member" : "lead";
    state.manualRouteMode = true;
    state.routeSelections.clear(); state.routeSelections.add(recordId); state.routeStart = null;
    navigate("routes"); showToast("Customer selected for an unplanned route.");
  }


  main.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const appointmentId = target.dataset.appointmentId;

    if (action === "go-schedule") navigate("schedule");
    if (action === "go-settings") navigate("settings");
    if (action === "open-day") navigate("day", { date: target.dataset.date || dateOnly() });
    if (action === "change-week") { state.scheduleWeekOffset += Number(target.dataset.offset) || 0; renderSchedule(); }
    if (action === "this-week") { state.scheduleWeekOffset = 0; renderSchedule(); }
    if (action === "schedule-contact") openScheduleForm("", target.dataset.date || dateOnly());
    if (action === "schedule-record") openScheduleForm(id, target.dataset.date || dateOnly());
    if (action === "add-nearby-lead") {
      const item = createAppointment(id, target.dataset.date || state.selectedDate, { repeatWeeks: 0 });
      if (item) { saveDatabase(); renderDay(); showToast("Lead added to this day."); }
    }
    if (action === "move-appointment") openMoveAppointment(appointmentId);
    if (action === "cancel-appointment") {
      const item = db.appointments.find(entry => entry.id === appointmentId);
      if (item && confirm(`Cancel ${appointmentName(item)} on ${formatDate(item.scheduledDate)}?`)) {
        item.status = "Cancelled"; item.updatedAt = isoNow(); syncRecordNextVisit(item.contactId); saveDatabase(); renderDay(); showToast("Visit cancelled.");
      }
    }
    if (action === "preview-reminder") openReminderPreview(appointmentId);
    if (action === "send-one-reminder") sendReminders({ appointmentIds: [appointmentId] });
    if (action === "copy-reminder") copyReminder(appointmentId);
    if (action === "send-day-reminders") sendReminders({ scheduledDate: target.dataset.date || state.selectedDate });
    if (action === "start-scheduled-route") startScheduledRoute(target.dataset.date || state.selectedDate || dateOnly());
    if (action === "open-manual-route") { state.manualRouteMode = true; renderRoutes(); }
    if (action === "complete-return-home") completeReturnHome();
    if (action === "repeat-after-complete") createRepeatAppointment(id, Number(target.dataset.weeks));
    if (action === "custom-repeat-date") openCustomRepeatDate(id);
    if (action === "no-repeat") { syncRecordNextVisit(id); saveDatabase(); closeModal(); render(); showToast("No next visit scheduled yet."); }

    if (action === "go-routes") { state.manualRouteMode = false; navigate("routes"); }
    if (action === "go-leads") navigate("leads");
    if (action === "go-members") navigate("members");
    if (action === "go-search") navigate("search");
    if (action === "open-detail") openDetail(id);
    if (action === "open-add-menu") openAddMenu();
    if (action === "add-specific") openAddForm(target.dataset.category || "lead");
    if (action === "set-filter") {
      if (state.screen === "members") state.memberFilter = target.dataset.filter;
      else state.leadFilter = target.dataset.filter;
      render();
    }
    if (action === "save-vcard") saveVCard(id);
    if (action === "edit-record") openEditForm(id);
    if (action === "photo-menu") openPhotoMenu(id);
    if (action === "voice-note") startVoiceNote();
    if (action === "send-note") sendNote(id);
    if (action === "open-gallery") openGallery(id, target.dataset.photoIndex);
    if (action === "mark-called") {
      const record = findRecord(id);
      if (record) { record.leadStage = "called"; addSystemEntry(record, "Marked as called."); saveDatabase(); renderDetail(); }
    }
    if (action === "book-one-time") updateCategory(id, "one_time", "One-time job booked.");
    if (action === "convert-member") updateCategory(id, "member", "Converted to member.");
    if (action === "not-proceeding") updateCategory(id, "not_proceeding", "Marked as not proceeding.");
    if (action === "complete-one-time") updateCategory(id, "past", "One-time job completed and saved as a past customer.");
    if (action === "make-lead") updateCategory(id, "lead", "Made an active lead.");
    if (action === "quick-add-route") quickAddRoute(id);
    if (action === "set-route-type") {
      state.routeType = target.dataset.routeType;
      state.routeSelections.clear();
      renderManualRouteBuilder();
    }
    if (action === "toggle-route-selection") {
      if (target.checked) state.routeSelections.add(id); else state.routeSelections.delete(id);
      const buildButton = main.querySelector('[data-action="build-route"]');
      if (buildButton) buildButton.textContent = `Build Route (${state.routeSelections.size})`;
      const selectedPill = main.querySelector(".selected-pill");
      if (selectedPill) selectedPill.textContent = `${state.routeSelections.size} selected`;
    }
    if (action === "select-route-defaults") selectRouteDefaults();
    if (action === "clear-route-selection") { state.routeSelections.clear(); renderManualRouteBuilder(); }
    if (action === "use-current-location") useCurrentLocation();
    if (action === "use-saved-start") useSavedStart();
    if (action === "build-route") buildRoute();
    if (action === "open-route-contact") openDetail(id);
    if (action === "refresh-route-location") refreshActiveRouteLocation();
    if (action === "complete-route-stop") completeCurrentStop(false);
    if (action === "skip-route-stop") completeCurrentStop(true);
    if (action === "finish-route" && confirm("End this route?")) finishRoute();
  });

  main.addEventListener("input", event => {
    const queryKeyById = {
      leadSearch: "leads",
      memberSearch: "members",
      globalSearch: "search",
      routeSearch: "routes"
    };
    const queryKey = queryKeyById[event.target.id];
    if (queryKey) {
      state.queries[queryKey] = event.target.value;
      const position = event.target.selectionStart;
      render();
      const replacement = document.getElementById(event.target.id);
      if (replacement) {
        replacement.focus();
        replacement.setSelectionRange(position, position);
      }
      return;
    }
    if (event.target.id === "messageText") {
      event.target.style.height = "auto";
      event.target.style.height = `${Math.min(120, event.target.scrollHeight)}px`;
    }
  });

  main.addEventListener("submit", event => {
    if (event.target.id !== "appSettingsForm") return;
    event.preventDefault();
    const data = new FormData(event.target);
    ["HomeAddress", "HomeLatitude", "HomeLongitude", "ReminderSendTime", "NearbyLeadSearchDays", "SMSMessageTemplate"].forEach(key => {
      db.settings[key] = String(data.get(key) || "").trim();
    });
    saveDatabase(); renderSettings(); showToast("Settings saved.");
  });

  modalRoot.addEventListener("click", event => {
    if (event.target === modalRoot) closeModal();
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "close-modal") closeModal();
    if (action === "add-specific") openAddForm(target.dataset.category || "lead");
    if (action === "take-photo") { closeModal(); cameraInput.click(); }
    if (action === "choose-photo") { closeModal(); libraryInput.click(); }
    if (action === "send-photo") sendPhoto();
    if (action === "discard-photo") { pendingPhotoData = null; closeModal(); cameraInput.click(); }
    if (action === "send-one-reminder") sendReminders({ appointmentIds: [target.dataset.appointmentId] });
    if (action === "copy-reminder") copyReminder(target.dataset.appointmentId);
    if (action === "repeat-after-complete") createRepeatAppointment(target.dataset.id, Number(target.dataset.weeks));
    if (action === "custom-repeat-date") openCustomRepeatDate(target.dataset.id);
    if (action === "no-repeat") { syncRecordNextVisit(target.dataset.id); saveDatabase(); closeModal(); render(); showToast("No next visit scheduled yet."); }
  });

  modalRoot.addEventListener("submit", event => {
    if (event.target.id === "addRecordForm") {
      event.preventDefault();
      submitAddForm(event.target);
    }
    if (event.target.id === "editRecordForm") {
      event.preventDefault();
      submitEditForm(event.target);
    }
    if (event.target.id === "scheduleVisitForm") {
      event.preventDefault();
      const data = new FormData(event.target);
      const item = createAppointment(String(data.get("contactId") || ""), String(data.get("scheduledDate") || ""), {
        repeatWeeks: Number(data.get("repeatWeeks")) || 0,
        reminderEnabled: data.get("reminderEnabled") === "on"
      });
      if (item) { saveDatabase(); closeModal(); navigate("day", { date: item.scheduledDate }); showToast("Visit added to the schedule."); }
    }
    if (event.target.id === "moveAppointmentForm") {
      event.preventDefault();
      const item = db.appointments.find(entry => entry.id === event.target.dataset.appointmentId);
      const newDate = String(new FormData(event.target).get("scheduledDate") || "");
      if (item && newDate) { updateAppointmentDate(item, newDate); saveDatabase(); closeModal(); navigate("day", { date: newDate }); showToast("Visit moved."); }
    }
    if (event.target.id === "customRepeatForm") {
      event.preventDefault();
      const recordId = event.target.dataset.recordId;
      const date = String(new FormData(event.target).get("scheduledDate") || "");
      const item = createAppointment(recordId, date, { repeatWeeks: 0 });
      if (item) { saveDatabase(); closeModal(); render(); showToast(`Next visit scheduled for ${formatDate(date)}.`); }
    }
  });

  cameraInput.addEventListener("change", () => handlePhotoFile(cameraInput.files[0]));
  libraryInput.addEventListener("change", () => handlePhotoFile(libraryInput.files[0]));

  bottomNav.addEventListener("click", event => {
    const button = event.target.closest("[data-screen]");
    if (!button) return;
    if (button.dataset.screen === "routes") state.manualRouteMode = false;
    navigate(button.dataset.screen);
  });

  backButton.addEventListener("click", () => {
    if (state.screen === "detail") navigate(detailParentScreen());
    else if (state.screen === "day") navigate("schedule");
    else navigate("home");
  });

  galleryClose.addEventListener("click", closeGallery);
  galleryPrev.addEventListener("click", () => moveGallery(-1));
  galleryNext.addEventListener("click", () => moveGallery(1));
  gallery.addEventListener("touchstart", event => { galleryTouchStartX = event.changedTouches[0].clientX; }, { passive: true });
  gallery.addEventListener("touchend", event => {
    const delta = event.changedTouches[0].clientX - galleryTouchStartX;
    if (Math.abs(delta) > 45) moveGallery(delta > 0 ? -1 : 1);
  }, { passive: true });

  window.addEventListener("keydown", event => {
    if (gallery.classList.contains("hidden")) return;
    if (event.key === "Escape") closeGallery();
    if (event.key === "ArrowLeft") moveGallery(-1);
    if (event.key === "ArrowRight") moveGallery(1);
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.classList.remove("hidden");
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(console.warn));
  }

  boot();
})();
