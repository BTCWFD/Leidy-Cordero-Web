# Verification Plan - Patient and Admin View UIs

Since the `run_command` tool timed out on user permission, all verification must be conducted via exhaustive static analysis of the frontend HTML/JS, server routing, and database modules.

## Verification Checklist

### 1. Verification of index.html loading and serving
- **Method**: Trace Express static serving configuration.
- **Artifacts**: `server.js`, `public/index.html`, `public/style.css`, `public/client.js`.
- **Expected Outcome**:
  - Express server configures static file serving middleware for the `public` directory.
  - `index.html` loads relative paths for stylesheets and client script correctly.

### 2. Verification of Date Selection and Slot Fetching/Rendering
- **Method**: Trace event listener on `booking-date` input, fetch logic, and DOM manipulation to render buttons.
- **Artifacts**: `public/client.js`, `server.js` (`/api/disponibilidad`), `database.js`.
- **Expected Outcome**:
  - Date input changes trigger `fetchSlots()`.
  - Fetch queries `/api/disponibilidad?date={date}`.
  - Server returns a list of available slots calculated by subtracting booked times from the standard list of 9 daily slots.
  - Client clears the slot container, creates a `<button>` element for each slot, attaches selection event listeners, and appends it to the DOM.

### 3. Verification of Form Submission sending valid JSON POST to /api/reservas
- **Method**: Analyze submit event listener on `booking-form`, payload construction, headers, and request body format.
- **Artifacts**: `public/client.js`, `server.js` (`/api/reservas`), `database.js`.
- **Expected Outcome**:
  - Form submit is intercepted using `e.preventDefault()`.
  - Input values are gathered and validated.
  - If valid, client sends a `POST` request to `/api/reservas` with `Content-Type: application/json` header and JSON-serialized body containing `{ name, date, time, phone }`.
  - Server handles the request via Express body parsing middleware (`express.json()`).

### 4. Verification of admin.html querying /admin/citas and rendering appointments
- **Method**: Analyze static loading of `admin.html`, date filter logic, API request, and DOM table generation.
- **Artifacts**: `public/admin.html`, `server.js` (`/admin/citas`), `database.js`.
- **Expected Outcome**:
  - `admin.html` runs `fetchAppointments()` on page load (`DOMContentLoaded`) and date filter changes.
  - Client queries `/admin/citas` (with or without `date` query parameter).
  - Server returns JSON array of appointments.
  - Client iterates over the array and dynamically constructs `<tr>` and `<td>` elements to populate the table.
