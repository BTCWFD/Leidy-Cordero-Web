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
2.  **Database Isolation**: The test runner sets an environment variable `DATABASE_PATH=citas_test.json` (or `DB_PATH=citas_test.json`) so that tests do not write to or corrupt the production database.
3.  **Clean State (Pre-test)**: Any existing test database file is deleted before the server starts to guarantee a predictable, clean state.
4.  **Graceful Teardown (Post-test)**: The server process is terminated using `process.kill()` or `SIGTERM`, and test database files are deleted.

### Execution Flow
1.  **Pre-flight**: Detect and clean up old test database files.
2.  **Spawn**: Execute `node server.js` asynchronously with `PORT=3001` and `DATABASE_PATH=citas_test.json` (also exporting `DB_PATH` for backwards/forwards compatibility).
3.  **Ping-check**: Send periodic HTTP `GET /` requests to port 3001 until the server is online (up to 3 seconds).
4.  **Run**: Execute the test cases defined in Tiers 1-4.
5.  **Teardown**: Send `SIGTERM` to the server process and clean up the test database file.

---

## 4. Test Suite Coverage Goals (Tiers 1-4)

### Tier 1: Feature Coverage (>= 20 cases total, >= 5 per feature)
These tests verify that each individual feature behaves correctly under standard conditions.

#### F1: Available Slots Display (5 cases)
1.  **F1-T1-1**: Verify `GET /api/disponibilidad` returns a list of slots for a valid future date.
2.  **F1-T1-2**: Verify the slot items contain expected schema properties or format: success boolean and list of slots.
3.  **F1-T1-3**: Verify querying availability without a date returns a `400 Bad Request`.
4.  **F1-T1-4**: Verify booking a slot successfully removes it from the list of available slots for that day.
5.  **F1-T1-5**: Verify loading the root index page `GET /` returns `200 OK` and serves static files.

#### F2: Patient Booking Form Submission (6 cases)
6.  **F2-T1-1**: Verify `POST /api/reservas` with valid parameters (`name`, `date`, `time`, `phone`) returns `200 OK` and `{ success: true, bookingId }`.
7.  **F2-T1-2**: Verify response includes a valid non-empty string or numeric `bookingId`.
8.  **F2-T1-3**: Verify booking is rejected with `400 Bad Request` if `name` is missing.
9.  **F2-T1-4**: Verify booking is rejected with `400 Bad Request` if `date` is missing.
10. **F2-T1-5**: Verify booking is rejected with `400 Bad Request` if `time` is missing.
11. **F2-T1-6**: Verify booking is rejected with `400 Bad Request` if `phone` is missing.

#### F3: Local Database Persistence (5 cases)
12. **F3-T1-1**: Verify that the database file is physically created at `DATABASE_PATH` / `DB_PATH` on the first write.
13. **F3-T1-2**: Verify that the database file size is exactly `0` or does not exist prior to writes, and becomes `> 0` bytes immediately after a successful booking.
14. **F3-T1-3**: Verify database file contains records matching the created booking's fields.
15. **F3-T1-4**: Verify that restarting the server (stop and start) retains database contents (persistence verification).
16. **F3-T1-5**: Verify database writes are synchronous or fully flushed before the HTTP response returns.

#### F4: Administrative View Endpoint (5 cases)
17. **F4-T1-1**: Verify `GET /admin/citas` returns `200 OK`.
18. **F4-T1-2**: Verify `GET /admin/citas` returns a JSON array.
19. **F4-T1-3**: Verify `/admin/citas` response array contains the recently booked appointment details.
20. **F4-T1-4**: Verify querying `/admin/citas` for a date with no appointments returns an empty array `[]` (if date filtered).
21. **F4-T1-5**: Verify `/admin/citas` response elements match the required structure: `{ id, name, date, time, phone }`.

---

### Tier 2: Boundary & Corner Cases (>= 20 cases total, >= 5 per feature)
These tests verify system behavior when presented with invalid, unexpected, or extreme inputs.

#### F1: Available Slots Display (5 cases)
1.  **F1-T2-1**: Query slots for a past date (should handle or return empty array).
2.  **F1-T2-2**: Query slots for an extreme future date.
3.  **F1-T2-3**: Query slots with invalid date format string (should handle gracefully or return empty/400).
4.  **F1-T2-4**: Query slots on leap-year day.
5.  **F1-T2-5**: Request availability when database file does not exist yet.

#### F2: Patient Booking Form Submission (6 cases)
6.  **F2-T2-1**: Attempt to book an already booked slot (double-booking) (must return `400 Bad Request`).
7.  **F2-T2-2**: Attempt to book with a name of extreme length.
8.  **F2-T2-3**: Attempt to book with SQL/NoSQL injection payload in the name field (must store safely as string).
9.  **F2-T2-4**: Attempt to book with HTML/XSS injection payload in name field (must store safely or sanitize).
10. **F2-T2-5**: Attempt to book with non-standard but valid phone formats.
11. **F2-T2-6**: Attempt to book with empty or blank values (should reject with `400 Bad Request`).

#### F3: Local Database Persistence (5 cases)
12. **F3-T2-1**: Write booking when DB path folder is invalid.
13. **F3-T2-2**: Verify system behavior when database file is modified or deleted during server runtime.
14. **F3-T2-3**: Test high volume write persistence and check database file integrity.
15. **F3-T2-4**: Write booking with emoji/UTF-8 multi-byte characters in name.
16. **F3-T2-5**: Initialize database with complex paths.

#### F4: Administrative View Endpoint (5 cases)
17. **F4-T2-1**: Query `/admin/citas` with no date parameter (should return all bookings).
18. **F4-T2-2**: Query `/admin/citas` with malformed date format.
19. **F4-T2-3**: Query `/admin/citas` with SQL injection payload in query params (must escape safely).
20. **F4-T2-4**: Query `/admin/citas` when database file does not exist yet (should return empty list `[]` instead of throwing `500 Server Error`).
21. **F4-T2-5**: Query `/admin/citas` with special characters in parameters.

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
2.  **F-T4-2: Clinic Rush Hour Concurrency Simulation**
3.  **F-T4-3: Full Schedule Lockout**
4.  **F-T4-4: Server Restart Recovery**
5.  **F-T4-5: Special Character Patient Information**

---

## 5. Test Execution Instructions

### Prerequisites
*   Node.js (version 18 or higher is recommended)

### Run Command
Execute the test script from the project root:
```bash
node test_booking.js
```

### Env Variables Supported by Test Suite
*   `PORT`: Port for the test server to bind to (Default: `3001`).
*   `DB_PATH`: Path to the test database file (Default: `citas_test.json`).
