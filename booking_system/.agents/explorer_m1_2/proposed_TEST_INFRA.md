# Test Infrastructure Specification: E2E Test Suite

This document defines the E2E test architecture, feature inventory, methodology, coverage goals, and execution instructions for the Quiropodia LC Booking System.

---

## 1. Test Architecture

The E2E test suite runs programmatically against a live instance of the Express server. It operates as an **opaque-box (black-box)** verification tool, interacting with the system solely through public HTTP endpoints and verifying side effects in the local database.

### Components
*   **Test Runner**: Node.js built-in `node:test` runner. No external dependencies (like Jest or Mocha) are required.
*   **Assertion Library**: Node.js built-in `node:assert` module.
*   **HTTP Client**: Node.js global `fetch` API (available in Node.js >= 18).
*   **Lifecycle Controller**: Spawns the server as a background process prior to test execution and terminates it upon completion.
*   **Database Inspector**: Built-in Node.js `fs` module to verify the existence, growth, and modification of the local database file (SQLite or JSON).

### Directory & File Structure
```
booking_system/
├── test_booking.js           # E2E Test Suite entry point and implementation
├── TEST_INFRA.md             # E2E Test Suite specifications (this file)
├── server.js                 # Express web server (to be tested)
├── database.js               # DB management module (to be tested)
├── package.json              # Project configuration and script runner
└── public/                   # Client-side static assets
    ├── index.html
    └── client.js
```

---

## 2. Feature Inventory

The test suite validates four core features:

*   **F1: Clinic Available Slots Display**
    *   Verifies that available time slots are correctly calculated and served by the backend or UI.
    *   Ensures that booked slots are excluded from availability.
*   **F2: Patient Booking Form Submission**
    *   Verifies validation, receipt, processing, and response code `200 OK` for valid patient bookings.
    *   Verifies that invalid or incomplete form details are rejected with `400 Bad Request` or `500 Server Error`.
*   **F3: Local Database Persistence**
    *   Asserts that a local file (e.g. `citas.json` or `database.sqlite`) is created, is non-empty (> 0 bytes), and persists the exact details of the bookings made.
*   **F4: Administrative View Endpoint**
    *   Verifies `/admin/citas` returns correct bookings for the requested date, ensuring proper access to records.

---

## 3. Test Methodology

### Isolation & Environment Control
1.  **Port Allocation**: The test suite runs the server on a dedicated test port (e.g., `PORT=3001`) to avoid conflicts with running production or development instances.
2.  **Database Isolation**: The test runner sets an environment variable `DB_PATH=citas_test.json` (or `database_test.sqlite`) so that tests do not write to or corrupt the production database.
3.  **Clean State (Pre-test)**: Any existing test database file is deleted before the server starts to guarantee a predictable, clean state.
4.  **Graceful Teardown (Post-test)**: The server process is terminated using `process.kill()` or `SIGTERM`, and test database files are deleted.

### Execution Flow
1.  **Pre-flight**: Detect and clean up old test database files.
2.  **Spawn**: Execute `node server.js` asynchronously with `PORT=3001` and `DB_PATH=citas_test.json`.
3.  **Ping-check**: Send periodic HTTP `GET /` requests to port 3001 until the server is online (up to 3 seconds).
4.  **Run**: Execute the test cases defined in Tiers 1-4.
5.  **Teardown**: Send `SIGTERM` to the server process and clean up the test database file.

---

## 4. Test Suite Coverage Goals (Tiers 1-4)

### Tier 1: Feature Coverage (>= 20 cases total, >= 5 per feature)
These tests verify that each individual feature behaves correctly under standard conditions.

#### F1: Available Slots Display (5 cases)
1.  **F1-T1-1**: Verify `GET /api/slots` (or `/api/disponibilidad`) returns a list of slots for a valid future date.
2.  **F1-T1-2**: Verify the slot items contain expected schema properties: `time` (string) and `available` (boolean).
3.  **F1-T1-3**: Verify querying availability for a clinic-closed day (e.g., Sunday) returns empty slots or closed indicator.
4.  **F1-T1-4**: Verify booking a slot successfully removes it from the list of available slots for that day.
5.  **F1-T1-5**: Verify loading the root index page `GET /` returns `200 OK` and contains slot-rendering DOM components.

#### F2: Patient Booking Form Submission (6 cases)
6.  **F2-T1-1**: Verify `POST /api/reservas` with valid parameters (`name`, `date`, `time`, `phone`) returns `200 OK` and `{ success: true, bookingId }`.
7.  **F2-T1-2**: Verify response includes a valid non-empty string or numeric `bookingId`.
8.  **F2-T1-3**: Verify booking is rejected with `400 Bad Request` if `name` is missing.
9.  **F2-T1-4**: Verify booking is rejected with `400 Bad Request` if `date` is missing.
10. **F2-T1-5**: Verify booking is rejected with `400 Bad Request` if `time` is missing.
11. **F2-T1-6**: Verify booking is rejected with `400 Bad Request` if `phone` is missing.

#### F3: Local Database Persistence (5 cases)
12. **F3-T1-1**: Verify that the database file is physically created at `DB_PATH` on the first write.
13. **F3-T1-2**: Verify that the database file size is exactly `0` or does not exist prior to writes, and becomes `> 0` bytes immediately after a successful booking.
14. **F3-T1-3**: Verify database file contains JSON/SQL records matching the created booking's fields.
15. **F3-T1-4**: Verify that restarting the server (stop and start) retains database contents (persistence verification).
16. **F3-T1-5**: Verify that database writes are synchronous or fully flushed before the HTTP response returns.

#### F4: Administrative View Endpoint (5 cases)
17. **F4-T1-1**: Verify `GET /admin/citas` returns `200 OK`.
18. **F4-T1-2**: Verify `GET /admin/citas` returns a JSON array.
19. **F4-T1-3**: Verify `/admin/citas` response array contains the recently booked appointment details.
20. **F4-T1-4**: Verify querying `/admin/citas` for a date with no appointments returns an empty array `[]`.
21. **F4-T1-5**: Verify `/admin/citas` response elements match the required structure: `{ id, name, date, time, phone }`.

---

### Tier 2: Boundary & Corner Cases (>= 20 cases total, >= 5 per feature)
These tests verify system behavior when presented with invalid, unexpected, or extreme inputs.

#### F1: Available Slots Display (5 cases)
1.  **F1-T2-1**: Query slots for a past date (should return empty array or `400 Bad Request`).
2.  **F1-T2-2**: Query slots for an extreme future date (e.g. 50 years in the future) (should handle gracefully or reject).
3.  **F1-T2-3**: Query slots with invalid date format string (e.g. `?date=xyz` or `?date=2026-13-45`) (should return `400 Bad Request`).
4.  **F1-T2-4**: Query slots on leap-year day (February 29, 2028) (should resolve correctly).
5.  **F1-T2-5**: Request availability when database file is corrupted/unreadable (should fail gracefully with `500 Server Error`).

#### F2: Patient Booking Form Submission (6 cases)
6.  **F2-T2-1**: Attempt to book an already booked slot (double-booking) (must return `400 Bad Request` or `409 Conflict`).
7.  **F2-T2-2**: Attempt to book with a name of extreme length (e.g. 1,000 characters) (should be validated and truncated or rejected).
8.  **F2-T2-3**: Attempt to book with SQL/NoSQL injection payload in the name field (e.g. `'; DROP TABLE citas; --`) (must store safely as string and not execute).
9.  **F2-T2-4**: Attempt to book with HTML/XSS injection payload in name field (e.g., `<script>alert(1)</script>`) (must store safely or sanitize).
10. **F2-T2-5**: Attempt to book with non-standard but valid phone formats (e.g., `+57 (300) 123-4567` or `001-234-567-8901`) (should succeed).
11. **F2-T2-6**: Attempt to book with invalid characters in phone field (e.g. `phone: "call-me-maybe"`) (should reject with `400 Bad Request`).

#### F3: Local Database Persistence (5 cases)
12. **F3-T2-1**: Write booking when disk is full / database file is read-only (should throw clean `500 Server Error` without server crash).
13. **F3-T2-2**: Verify system recovery when the database file is manually deleted during server runtime.
14. **F3-T2-3**: Test high volume write persistence (e.g., writing 10 bookings in rapid succession) and check database file integrity.
15. **F3-T2-4**: Write booking with emoji/UTF-8 multi-byte characters in name (e.g. `Patient 🌟`) and verify database encoding.
16. **F3-T2-5**: Initialize database using a relative path containing spaces (e.g., `./test folder/db.json`) and verify path resolving.

#### F4: Administrative View Endpoint (5 cases)
17. **F4-T2-1**: Query `/admin/citas` with no date parameter (must default to current date).
18. **F4-T2-2**: Query `/admin/citas` with malformed date format (should return `400 Bad Request` or default gracefully).
19. **F4-T2-3**: Query `/admin/citas` with SQL injection payload in query params (e.g., `/admin/citas?date=2026-06-30' OR '1'='1`) (must escape safely and return no matches).
20. **F4-T2-4**: Query `/admin/citas` when database file does not exist yet (should return empty list `[]` instead of throwing `500 Server Error`).
21. **F4-T2-5**: Query `/admin/citas` with an extremely long date string to test buffer limits.

---

### Tier 3: Cross-Feature Combinations (>= 4 cases total)
These tests verify correct system state synchronization across different endpoints and features.

1.  **F-T3-1: End-to-End Booking Lifecycle**
    *   *Steps*: Query available slots (F1) -> Find Slot S. Submit booking for Slot S (F2) -> Success. Verify DB file size increased (F3). Query availability again (F1) -> Slot S is now marked unavailable. Call `/admin/citas` (F4) -> Slot S is listed for that patient.
2.  **F-T3-2: Double Booking Prevention & State Sync**
    *   *Steps*: Fetch availability (F1). Client A and Client B submit bookings for the exact same slot concurrently (F2). One booking must succeed (`200 OK`), and the other must fail (`400 Bad Request`). Verify database contains exactly one record (F3). Verify `/admin/citas` (F4) lists only the successful booking.
3.  **F-T3-3: Multi-Day Routing and Segregation**
    *   *Steps*: Book slot on Day A (F2). Book slot on Day B (F2). Verify DB persists both records (F3). Query `/admin/citas?date=DayA` (F4) -> returns only Day A booking. Query `/admin/citas?date=DayB` (F4) -> returns only Day B booking.
4.  **F-T3-4: Available Slot Re-calculation on Deletion (Future-proofing)**
    *   *Steps*: Book slot S (F2). Verify slot S is unavailable (F1). Admin removes/cancels appointment S (via database reset/admin action) (F4). Verify slot S is immediately marked available again (F1).

---

### Tier 4: Real-World Application Scenarios (>= 5 cases total)
These tests simulate complete patient journeys and operational occurrences.

1.  **F-T4-1: Standard Patient Happy Path**
    *   *Scenario*: A new patient visits the booking site. They view availability, select tomorrow at 10:00 AM, fill in their name and phone, and submit. They see a booking confirmation. The doctor opens the admin page for tomorrow and sees the patient scheduled.
2.  **F-T4-2: Clinic Rush Hour Concurrency Simulation**
    *   *Scenario*: 10 patients attempt to book the exact same 9:00 AM slot at the same instant (simulated via concurrent Promise.all requests). Exactly 1 booking is successfully registered. The other 9 patients receive a slot-already-taken error. The database remains healthy and contains only 1 entry.
3.  **F-T4-3: Full Schedule Lockout**
    *   *Scenario*: A day has 8 slots available. 8 different patients book all 8 slots. A 9th patient attempts to book any slot on that day. The availability endpoint shows no available slots, and any booking request for that day returns a validation error. The admin panel lists all 8 appointments.
4.  **F-T4-4: Server Restart Recovery**
    *   *Scenario*: The clinic schedules 5 appointments. The server suffers an unexpected shutdown (simulated by terminating the process). The server is restarted. Patient availability query correctly honors the 5 booked slots. The admin view correctly displays all 5 appointments.
5.  **F-T4-5: Special Character Patient Information**
    *   *Scenario*: A patient named "María José O'Connor-Muñoz 🌟" books a slot. The database successfully persists the UTF-8 characters. The admin view displays the name with correct encoding, and the slot is blocked in availability.

---

## 5. Test Execution Instructions

### Prerequisites
*   Node.js (version 18 or higher is recommended)

### Run Command
Execute the test script from the project root:
```bash
npm test
```
*(Ensure `package.json` contains `"test": "node test_booking.js"`)*

### Env Variables Supported by Test Suite
*   `PORT`: Port for the test server to bind to (Default: `3001`).
*   `DB_PATH`: Path to the test database file (Default: `citas_test.json`).
