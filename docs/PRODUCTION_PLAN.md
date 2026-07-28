# Production Build Plan

## Product rule

The production system should remain deliberately simple. Rami's normal actions should be limited to:

- Call
- Navigate
- Camera
- Send
- Done
- Skip
- Convert to Member
- Book One-Time Job

Technical fields such as latitude, longitude, Drive file IDs, message IDs and route grouping must remain hidden.

## Customer lifecycle

A single person record changes status rather than being copied:

```text
Saved Contact -> Lead
Lead -> One-Time Job -> Past Customer
Lead -> Member
Past Customer -> Member
Member -> Past Customer
```

### Visible statuses

- New Lead
- Called Lead
- Booked One-Time Job
- Member
- Past Customer
- Saved Contact
- Not Proceeding

## Proposed Google Sheet tabs

### Contacts

- contact_id
- status
- lead_stage
- name
- mobile
- email
- address
- suburb
- state
- postcode
- formatted_address
- place_id
- latitude
- longitude
- street_key
- service
- callback_text
- source
- gmail_message_id
- created_at
- updated_at
- last_visit
- next_visit
- active

### Timeline

- timeline_id
- contact_id
- entry_type
- text
- created_at
- photo_drive_file_id
- photo_thumbnail_url
- source

One timeline entry may have multiple photo rows sharing the same timeline ID, or photos can be stored in a separate Photos tab.

### Routes

- route_id
- route_type
- created_at
- start_latitude
- start_longitude
- contact_id
- stop_order
- stop_status
- completed_at

### Settings

- key
- value

## Photo storage

Store photos in a private Google Drive root folder. Create one automatic folder per contact:

```text
Rami Pool Care/
  Contacts/
    CONTACT-ID - Customer Name/
```

The user interface should show a chronological chat timeline. Pressing any photo opens a full-screen gallery containing every photo for that contact, with swipe and arrow controls.

## Lead email import

Recommended first approach:

1. Forward the Jim's lead messages into an authorised Gmail inbox.
2. Apply a Gmail label such as `Jims-New-Leads`.
3. Run a scheduled server job or Apps Script trigger.
4. Parse name, address, suburb, mobile, email, service, callback and comments.
5. Save the Gmail message ID for duplicate prevention.
6. Check phone, email and normalised address for an existing contact.
7. Create or flag the lead.

## Routing

### Member route

- Select all due members or choose manually.
- Start from the phone's current location.
- Keep addresses on the same street together.
- Move to the next nearest street group.
- Open Google Maps for the current stop.
- After Done or Skip, recalculate the remaining route.

### Lead route

- Select all active leads and booked one-time jobs or choose manually.
- Use the same routing workflow, separate from members.

### Existing route logic to preserve

- Street grouping
- Suburb awareness
- Sensible direction along a street
- Multiple route parts when external Google Maps links cannot contain all stops
- Bad-coordinate checks and geocoding repair

For the production application, road travel times should be calculated server-side rather than exposing a Maps API key in the phone browser.

## Security

- Rami-only authentication in version one
- No publicly shared Google Sheet
- No publicly shared Drive photo folder
- Server-side secrets only
- Restricted Google API keys
- Secure cookies and HTTPS
- Automatic backups
- Record-level timestamps and activity history
