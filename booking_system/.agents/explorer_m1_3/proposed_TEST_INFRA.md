# TEST_INFRA.md (Draft / Proposal)

## Test Architecture & Framework
To ensure the clinic booking system is robust, lightweight, and works out-of-the-box in local environments, the E2E test suite is designed with the following architectural principles:

1. **Native Node.js Test Runner**:
   - Uses the built-in `node:test` framework and `node:assert` library (available in Node.js v18 and above).
   - Requires zero external npm dependencies (`npm install` is not required for testing).
   - Highly performant and standard.

2. **Isolated Server Lifecycles**:
   - The test runner (`test_booking.js`) programmatically starts the Express server as a child process before executing tests.
   - It runs the server on a dedicated test port (e.g., `3001`) and sets a temporary database path environment variable (e.g., `DB_PATH=test_citas.json`).
   - After test completion, the runner terminates the child process and deletes the test database file, ensuring no side effects or test pollution.

3. **DB File Assertions**:
   - Asserts the database file exists using `fs.existsSync(dbPath)`.
   - Asserts database size is greater than 0 bytes using `fs.statSync(dbPath).size > 0`.
   - Directly parses the database content (or calls `GET /admin/citas`) to verify accurate field serialization.

---

## Directory Structure
```
booking_system/
├── public/                 # Static UI assets
│   ├── index.html          # Patient booking form
│   ├── style.css           # UI styling
│   └── client.js           # Client-side booking logic
├── server.js               # Express application entry point
├── database.js             # Database management module (SQLite/JSON)
├── package.json            # Node.js project manifest
├── test_booking.js         # Automated E2E verification script (Test Runner)
└── TEST_INFRA.md           # Test architecture & specifications (this document)
```

---

## How to Run the Test Suite
The E2E tests are executed directly using the Node.js runtime:
```bash
node test_booking.js
```
The script will output the test results in TAP or spec format.

---

## Features under Test
1. **F1: Clinic Available Slots Display**: Checks if available time slots for a given date are displayed/returned.
2. **F2: Patient Booking Form Submission**: Verifies booking creation request, field validations, and API response.
3. **F3: Local Database Persistence**: Asserts database file creation, size, and data retrieval stability.
4. **F4: Administrative View Endpoint**: Checks GET `/admin/citas` returns correct booking data.

---

## Test Inventory

### Tier 1: Feature Coverage (20 Cases)
#### Feature F1: Clinic Available Slots Display
- **T1.1: Default Slot Presentation** - `GET /api/slots?date=2026-07-01` returns all 8 clinic slots (09:00 - 16:00) for a clean day.
- **T1.2: Future Date Slot Fetching** - Querying slots for a date in the future succeeds and returns slots.
- **T1.3: Static Page UI Load** - `GET /` returns HTML document containing reservation form.
- **T1.4: Slot Removal Post-Booking** - Booking a slot makes it disappear from the slots list.
- **T1.5: Weekday Consistency** - Slots return correctly for both Monday and Friday.

#### Feature F2: Patient Booking Form Submission
- **T1.6: Standard Booking Submission** - `POST /api/reservas` with valid fields returns `200 OK` and `{ success: true, bookingId }`.
- **T1.7: Name with Spaces Support** - Submitting booking with multi-word name (e.g. "Juan Perez") succeeds.
- **T1.8: Phone Number Formats** - Accepting phone formats like "+34 600 000 000" or local numbers.
- **T1.9: Last Slot Booking** - Successfully books the final daily slot (`16:00`).
- **T1.10: First Slot Booking** - Successfully books the first daily slot (`09:00`).

#### Feature F3: Local Database Persistence
- **T1.11: DB File Creation** - The DB file is physically created after the first booking.
- **T1.12: DB File Size Growth** - DB file size is greater than 0 bytes after a booking.
- **T1.13: Data Accuracy in DB** - Values in DB file exactly match submitted request values.
- **T1.14: Multi-Record Persistence** - DB stores multiple bookings sequentially without overwriting.
- **T1.15: Server Restart Persistence** - Bookings are still present after server stop and restart.

#### Feature F4: Administrative View Endpoint
- **T1.16: Admin Endpoint Returns JSON** - `GET /admin/citas` returns a JSON array.
- **T1.17: Empty Database Admin State** - `/admin/citas` returns `[]` when no bookings exist.
- **T1.18: Single Booking Verification** - Created booking is present in the admin list with correct properties.
- **T1.19: Multi-Booking List** - Admin list contains all bookings created on the server.
- **T1.20: Sorting Order** - Appointments are returned sorted chronologically by time.

---

### Tier 2: Boundary & Corner Cases (21 Cases)
#### Feature F1: Clinic Available Slots Display
- **T2.1: Past Date Slots Request** - Querying slots for a past date returns `[]` or 400 Bad Request.
- **T2.2: Invalid Date Format** - Querying with invalid strings (e.g., `invalid-date`) returns 400 Bad Request.
- **T2.3: Closed Days (Weekend)** - Requesting slots for Sunday returns an empty list or 400 Bad Request.
- **T2.4: Current Date Partial Slots** - Slots in the past relative to today's current hour are excluded.
- **T2.5: Missing Date Parameter** - Querying available slots without `date` query parameter returns 400 Bad Request.

#### Feature F2: Patient Booking Form Submission
- **T2.6: Missing Required Fields** - Submitting booking with missing fields returns 400 Bad Request.
- **T2.7: Empty String Values** - Submitting empty fields (e.g. `name: ""`) returns 400 Bad Request.
- **T2.8: Double Booking Prevention** - Requesting a slot that is already booked returns 400 Bad Request.
- **T2.9: Past Date Booking** - Booking for a past date returns 400 Bad Request.
- **T2.10: Off-Hours Slot Time** - Booking a slot like "23:00" returns 400 Bad Request.
- **T2.11: HTML Injection / Script Tags** - Entering HTML tags in name is sanitized or safely escaped.

#### Feature F3: Local Database Persistence
- **T2.12: Read-Only Database File System Lock** - System returns 500 error gracefully if database is locked/inaccessible.
- **T2.13: Emojis and Special Characters in Fields** - DB correctly persists accent letters (á, é, í, ó, ú, ñ) and symbols.
- **T2.14: Concurrent Write Integrity** - System remains stable and uncorrupted under concurrent booking requests.
- **T2.15: Database File Corruption Resistance** - System does not crash at startup if database contains corrupt data.
- **T2.16: Extreme DB Size Growth** - Database stays fast and performs well with up to 50+ records.

#### Feature F4: Admin Endpoint /admin/citas
- **T2.17: Missing DB File Graceful Handling** - Endpoint returns `[]` instead of crashing if DB file does not exist.
- **T2.18: Excessive Bookings Load** - Verifying retrieval of list containing 100+ appointments is fast and successful.
- **T2.19: SQL Injection / Query Parameter Injection** - Malicious parameters in request query do not leak data or cause errors.
- **T2.20: Invalid Field Format in Database** - Legacy data records missing fields (e.g., phone) do not crash the endpoint.
- **T2.21: Unauthorized Access/Security Headers** - Endpoint responds to general client request, ensuring public admin access works as designed.

---

### Tier 3: Cross-Feature Combinations (4 Cases)
- **T3.1: Booking and Slot Update Cascade**:
  1. `GET /api/slots?date=2026-07-01` -> observe `11:00` is present.
  2. `POST /api/reservas` booking `11:00` on `2026-07-01`.
  3. `GET /api/slots?date=2026-07-01` -> verify `11:00` is absent.
  4. `GET /admin/citas` -> verify booking appears in the list.
- **T3.2: Concurrent Booking and Slot Exhaustion**:
  1. Query slots for `2026-07-02` (e.g., 8 slots available).
  2. Submit bookings for all 8 slots.
  3. Query `GET /api/slots?date=2026-07-02` -> verify empty array `[]` (exhausted).
  4. Query `GET /admin/citas` -> verify all 8 bookings are registered.
- **T3.3: Database Reset State Reversion**:
  1. Create booking for `10:00` on `2026-07-03`.
  2. Verify slot is gone and listed in admin view.
  3. Stop server. Delete database file. Restart server.
  4. Query slots for `2026-07-03` -> verify `10:00` is available again.
  5. Query `GET /admin/citas` -> verify empty array `[]`.
- **T3.4: Race Condition / Duplicate Booking Prevention**:
  1. Send two concurrent `POST /api/reservas` requests for name A and B at `09:00` on `2026-07-04` simultaneously.
  2. Verify that one request gets HTTP 200 and the other gets HTTP 400.
  3. Verify `GET /admin/citas` returns exactly 1 booking for `09:00` on `2026-07-04`.

---

### Tier 4: Real-World Application Scenarios (5 Cases)
- **T4.1: Standard Patient Journey**:
  1. Load patient UI `GET /`.
  2. Get available slots for tomorrow.
  3. Submit booking with valid name and phone.
  4. Verify booking details are written to DB and slot is marked as booked.
  5. Admin views list and confirms appointment exists.
- **T4.2: Booking Revision (Double Booking Recovery)**:
  1. Patient A books `09:00` on `2026-07-05`.
  2. Patient B attempts to book `09:00` on `2026-07-05` and is rejected.
  3. Patient B selects `10:00` instead and succeeds.
  4. Doctor views bookings list to confirm both appointments exist on separate slots.
- **T4.3: High-Volume Booking Rush (Monday Morning)**:
  1. Simulate 15 booking requests sent within a 2-second window.
  2. Check database and `/admin/citas` to confirm all 15 bookings are successfully recorded without error or duplication.
- **T4.4: Doctor's Daily Review Cycle**:
  1. Doctor checks appointments.
  2. New bookings occur.
  3. Doctor refreshes view and sees all new bookings sorted chronologically.
- **T4.5: Patient Input Validation Loop**:
  1. Patient tries submitting malformed phone -> rejected.
  2. Patient tries submitting empty name -> rejected.
  3. Patient inputs correct fields -> successfully booked.
  4. Database holds only 1 valid booking.
