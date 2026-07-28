# Rami Pool Care — Timetable & Route Planner V4

This version adds Rami's requested weekly scheduling workflow to the existing Google-connected app.

## What is now included

- A simple weekly timetable with one card per day
- Add members, leads and one-time jobs to a particular day
- Set a normal 2-week, 4-week or choose-each-time visit cycle
- After completing a member visit, choose 2 weeks, 4 weeks, another date or no next visit yet
- A list of due members who do not yet have a day
- Area labels for each day
- Nearby-lead suggestions based on suburb or saved coordinates
- Lead pages show the next scheduled run near that lead
- Daily route starts from the phone's current location and ends at the saved home location
- Optional Google Routes API waypoint optimisation, with a local return-home optimiser as a fallback
- Day-before reminder message previews
- Manual copy/open-in-Messages fallback before an SMS provider is connected
- Optional automatic Twilio SMS sending
- Two Vercel Cron checks that safely cover 5:00 pm Sydney time in both standard time and daylight saving time
- Duplicate protection using each appointment's reminder status
- Existing contacts, photos, notes, call, navigation and swipeable gallery features remain

## Google Sheet changes

The app now automatically creates any missing tabs, including `Appointments`.

The main tabs used by V4 are:

- Contacts
- Timeline
- Appointments
- Routes
- Settings

Existing contacts are retained. A member with an existing `NextVisit` date is migrated into an appointment automatically when V4 first loads.

## Important setup notes

### Home address

Until Rami confirms another finishing point, V4 uses the previously saved Rosehill location:

`7 Weston St, Rosehill NSW 2142`

Open **Home → Home address and reminder settings** to change the address and coordinates.

### SMS

The schedule, reminder previews and copy-to-phone workflow work without Twilio.

Automatic SMS requires the optional Twilio environment variables listed in `VERCEL_ENVIRONMENT_VARIABLES_V4.txt`.

### Google road-time optimisation

The app always has a local cycle-aware fallback that includes the return trip home.

For Google's road-time waypoint ordering, add `GOOGLE_MAPS_SERVER_KEY` with the Routes API enabled and restrict the key to the Routes API and the server environment.

## Endpoints added in V4

- `POST /api/route-optimize` — optional Google Routes waypoint ordering
- `POST /api/reminders` — send or preview selected reminder messages
- `GET /api/cron-reminders-0600` — automatic reminder check
- `GET /api/cron-reminders-0700` — automatic reminder check

## Validation completed

- JavaScript syntax checks for every frontend and API file
- Mocked Google data load
- Home screen rendering
- Weekly schedule rendering
- Daily timetable rendering
- Nearby lead suggestion rendering
- Lead page upcoming-area suggestion rendering
