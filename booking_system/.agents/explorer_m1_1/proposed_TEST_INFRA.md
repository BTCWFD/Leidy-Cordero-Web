# TEST_INFRA.md

This document defines the E2E Test Suite specifications, features under test, test cases hierarchy, and technical testing infrastructure for the **Quiropodia LC Booking System**.

---

## 1. Feature Inventory

### F1: Clinic Available Slots Display
* **Description**: The patient-facing interface retrieves and displays available booking slots for a given date.
* **Interface Contract**:
  * Request: `GET /api/disponibilidad?date=YYYY-MM-DD`
  * Response (Success): `200 OK` with JSON array: `["09:00", "10:00", "11:00", "15:00", "16:00"]`
  * Response (Error): `400 Bad Request` with `{ success: false, error: "Invalid date format" }`
* **Core Logic**:
  * Default clinic slots are defined (e.g., hourly between 09:00 and 17:00).
  * Already booked slots for the selected date are excluded from the response.
  * Weekend/Holiday logic may apply.

### F2: Patient Booking Form Submission
* **Description**: Patients fill out a form (Name, Phone, Date, Time) and submit it to reserve a slot.
* **Interface Contract**:
  * Request: `POST /api/reservas`
  * Body (JSON): `{ "name": "Laidy Cordero", "date": "2026-07-01", "time": "10:00", "phone": "600112233" }`
  * Response (Success): `200 OK` with `{ "success": true, "bookingId": "abc-123-xyz" }`
  * Response (Error): `400 Bad Request` or `500 Server Error` with `{ "success": false, "error": "Reason" }`
* **Core Logic**:
  * Validate presence of all fields.
  * Validate date is in the future.
  * Validate slot is currently available (no double booking).
  * Assign a unique booking identifier.

### F3: Local Database Persistence
* **Description**: Bookings are written to a persistent, zero-configuration local database (SQLite file or JSON file).
* **Location**: File path defined in environment variables (e.g., `DATABASE_PATH=database.sqlite` or `citas.json`).
* **Core Logic**:
  * File is initialized automatically if missing.
  * Writes are synchronous or transactionally safe.
  * File size must exceed 0 bytes after a booking.
  * Reloading the server reads from this file to restore state.

### F4: Administrative View Endpoint
* **Description**: Administrative view/API that lists booked appointments for audit.
* **Interface Contract**:
  * Request: `GET /admin/citas`
  * Response (Success): `200 OK` with JSON array:
    ```json
    [
      {
        "id": "abc-123-xyz",
        "name": "Laidy Cordero",
        "date": "2026-07-01",
        "time": "10:00",
        "phone": "600112233"
      }
    ]
    ```
* **Core Logic**:
  * Reads all bookings from the database.
  * Optionally supports filtering (e.g., `?date=YYYY-MM-DD`).

---

## 2. Test Specifications (Tiers 1-4)

### Tier 1: Feature Coverage (20 cases total, 5 per feature)

#### Feature 1: Available Slots Display (F1)
1. **F1-TC1**: Retrieve default slots for a standard weekday and check that the array is non-empty.
2. **F1-TC2**: Verify slots response returns an array of strings in `HH:MM` format.
3. **F1-TC3**: Verify that booking a slot makes it disappear from the available slots list for that date.
4. **F1-TC4**: Retrieve slots for a weekend (e.g., Sunday) and check if it correctly returns an empty array or closed indicator.
5. **F1-TC5**: Verify that querying slots on different dates returns separate independent lists.

#### Feature 2: Booking Submission (F2)
6. **F2-TC1**: Submit a fully valid booking. Verify `200 OK` and `{ success: true, bookingId: ... }` structure.
7. **F2-TC2**: Submit booking with a Spanish name containing accents/special characters (e.g., "María José Nuñez"). Verify success.
8. **F2-TC3**: Submit booking with a phone number containing a country code (e.g., "+34600112233"). Verify success.
9. **F2-TC4**: Submit booking with standard format date (YYYY-MM-DD) and slot (HH:MM). Verify success.
10. **F2-TC5**: Attempt booking the last slot of the day (e.g., "17:00"). Verify success.

#### Feature 3: DB Persistence (F3)
11. **F3-TC1**: Assert that the DB file is auto-created in the specified path on the first booking.
12. **F3-TC2**: Assert that the DB file size is greater than 0 bytes after a successful booking.
13. **F3-TC3**: Verify the saved record contents in the database exactly match the submitted fields.
14. **F3-TC4**: Verify that sequential bookings append records to the DB without overwriting prior ones.
15. **F3-TC5**: Restart server and assert that already booked appointments remain in the database (persistence verification).

#### Feature 4: Admin Endpoint (F4)
16. **F4-TC1**: Query `/admin/citas` and verify success response status `200 OK`.
17. **F4-TC2**: Verify `/admin/citas` returns a JSON content-type header.
18. **F4-TC3**: Verify that a newly submitted booking appears in the admin list with correct values.
19. **F4-TC4**: Verify the administrative response is a valid JSON array structure.
20. **F4-TC5**: Verify the admin endpoint is accessible and lists all currently persisted bookings.

---

### Tier 2: Boundary & Corner Cases (20 cases total, 5 per feature)

#### Feature 1: Available Slots Display (F1)
1. **F1-TC6**: Query slots for a date in the past. Verify it returns empty array or error (past dates cannot be booked).
2. **F1-TC7**: Query slots with invalid date strings (e.g., "not-a-date", "2026/06/31", "30-06-2026"). Verify `400 Bad Request`.
3. **F1-TC8**: Query slots for a date far in the future (e.g. 5 years). Check if the system handles it or returns a boundary error.
4. **F1-TC9**: Query slots when all times for the day are already booked. Verify response is an empty array `[]`.
5. **F1-TC10**: Query slots without the `date` query parameter. Verify it handles gracefully (e.g., defaults to today or returns `400 Bad Request`).

#### Feature 2: Booking Submission (F2)
6. **F2-TC6**: Submit booking with missing `name` field. Verify rejection with `400 Bad Request`.
7. **F2-TC7**: Submit booking with empty/whitespace name (e.g. `"   "`). Verify rejection with `400 Bad Request`.
8. **F2-TC8**: Submit booking with an invalid phone format (e.g. "abc", "123"). Verify rejection with `400 Bad Request`.
9. **F2-TC9**: Submit booking for a date in the past. Verify rejection with `400 Bad Request`.
10. **F2-TC10**: Attempt double-booking: Submit a booking for a slot that is already booked. Verify rejection with `400 Bad Request`.
11. **F2-TC11**: Submit booking for an invalid slot time (e.g. "04:30" or "23:00" when clinic is closed). Verify rejection with `400 Bad Request`.

#### Feature 3: DB Persistence (F3)
12. **F3-TC6**: Start server with an empty 0-byte database file. Verify it initializes correctly without errors.
13. **F3-TC7**: Submit SQL injection payload (e.g., `' OR '1'='1`) or NoSQL injection characters in fields. Verify they are safely escaped and persisted literally.
14. **F3-TC8**: Submit booking with long text fields (e.g. 500-char name) and verify DB persistence does not truncate or fail.
15. **F3-TC9**: Submit booking with complex UTF-8 characters (e.g. emojis 📅 or foreign characters). Verify correct retrieval and persistence.
16. **F3-TC10**: Simulate a write-locked DB file. Verify the server returns a `500 Server Error` and does not crash.

#### Feature 4: Admin Endpoint (F4)
17. **F4-TC6**: Query `/admin/citas` when database file is empty/non-existent. Verify it returns `200 OK` with an empty array `[]`.
18. **F4-TC7**: Query admin view with SQL injection payloads in query parameters. Verify it handles safely without crash/leakage.
19. **F4-TC8**: Query `/admin/citas` with unsupported HTTP methods (e.g., `POST`, `PUT`, `DELETE`). Verify rejection with `405 Method Not Allowed` or `404 Not Found`.
20. **F4-TC9**: Verify admin view response format handles thousands of bookings efficiently without timing out.

---

### Tier 3: Cross-Feature Combinations (4 cases total)

1. **TC-CROSS-01: End-to-End Lifecycle (F1 -> F2 -> F3 -> F4 -> F1)**
   * Query slots for a date (F1) -> Select slot (e.g., "11:00") -> Book slot (F2) -> Assert DB file size updated (F3) -> Retrieve admin list and confirm record exists (F4) -> Re-query slots and verify "11:00" is gone (F1).
2. **TC-CROSS-02: Concurrent Double-Booking Race Condition (F1 -> F2 -> F3 -> F4)**
   * Identify last remaining slot (F1). Issue two rapid concurrent booking requests for it (F2). Confirm that exactly one booking succeeds (`200 OK`) and the other is rejected (`400 Bad Request`). Verify database contains only one booking (F3) and admin lists only one patient (F4).
3. **TC-CROSS-03: Admin View Filter and Database Alignment (F3 -> F4)**
   * Directly insert two records into the DB: one for `2026-07-01` and one for `2026-07-02` (F3). Query `/admin/citas?date=2026-07-01` and verify it only lists the first booking. Query `/admin/citas?date=2026-07-02` and verify it only lists the second (F4).
4. **TC-CROSS-04: DB Reset / File Deletion Resilience (F3 -> F1 -> F2)**
   * While server is running, delete the DB file (F3). Query slots (F1) and verify default slots return. Submit booking (F2) and verify DB file is auto-regenerated and size > 0 (F3).

---

### Tier 4: Real-World Application Scenarios (5 cases total)

1. **TC-REAL-01: Full Day Booking Operation**
   * Simulate booking every single hourly slot (e.g., 09:00 to 17:00, 9 slots total) for a given date by different patients. Verify all succeed, the DB file correctly holds all 9 rows, and the slot availability query returns empty array `[]`.
2. **TC-REAL-02: Rescheduling (Cancellation + Re-booking)**
   * A patient books "10:00" on a Monday. They decide to reschedule to "14:00". The system deletes/updates the old booking, books the new slot. Verify that:
     * "10:00" is available again.
     * "14:00" is now occupied.
     * The DB file contains only the active booking (or marked inactive).
     * The admin endpoint displays only the updated schedule.
3. **TC-REAL-03: Timezone and DST Rollover**
   * Query and submit bookings for dates that transition into/out of Daylight Saving Time (DST) or late-night bounds (e.g. booking at "23:00" or checking slots on a DST transition date). Verify that the database stores dates in local time or ISO UTC format consistently without shifting the calendar day.
4. **TC-REAL-04: Admin System Audit and Zero-State Check**
   * Run a daily routine check. Server starts fresh. Admin checks `/admin/citas` (empty). Patient books a morning slot. Admin checks again (shows 1 booking). Patient books afternoon slot. Admin checks (shows 2 bookings). Server restarts. Admin checks (still shows 2 bookings).
5. **TC-REAL-05: Server Crash Recovery During Transaction**
   * Submit 3 valid bookings. Kill the server process mid-operation. Restart the server. Verify that all 3 bookings are successfully loaded from the DB, and slot availability and admin endpoints serve consistent data immediately upon recovery.

---

## 3. Test Framework & Directory Structure

### Framework
* **Engine**: Node.js Native Test Runner (`node:test` and `node:assert`).
* **Reasoning**: Native execution, zero dependencies (`npm install` not strictly needed for test runner), fast execution, compatible with Windows/Linux.
* **HTTP Client**: Built-in `globalThis.fetch` (Node 18+).

### Directory Structure
```
booking_system/
├── .agents/                    # Agent metadata (hidden from core src/tests)
├── public/                     # Static patient UI
│   ├── index.html
│   ├── style.css
│   └── client.js
├── database.js                 # Local DB Manager (SQLite or JSON)
├── server.js                   # Express application and route definitions
├── test_booking.js             # Automated E2E verification test harness
├── TEST_INFRA.md               # Test specs and coverage goals (this file)
└── package.json                # Project manifest and dev dependencies
```

### Server Start/Stop Management
* **Mechanism**: The E2E script `test_booking.js` spawns the server as a child process:
  ```javascript
  const { spawn } = require('child_process');
  const path = require('path');
  
  let serverProcess;
  const PORT = process.env.PORT || 3001;
  const DB_PATH = process.env.DATABASE_PATH || 'test_citas.json';
  
  function startServer() {
    return new Promise((resolve, reject) => {
      serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
        env: { ...process.env, PORT, DATABASE_PATH: DB_PATH }
      });
      
      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('running') || data.toString().includes('listening')) {
          resolve();
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        console.error(`Server stderr: ${data}`);
      });
      
      serverProcess.on('error', reject);
    });
  }
  
  function stopServer() {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
  ```

### Database Assertions
* **Mechanism**: Standard Node.js `fs` module:
  ```javascript
  const fs = require('fs');
  const assert = require('assert');
  
  // Clean DB before test run
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  
  // Assert DB existence and size
  assert.ok(fs.existsSync(DB_PATH), "Database file should exist");
  const stats = fs.statSync(DB_PATH);
  assert.ok(stats.size > 0, "Database file size should be greater than 0 bytes");
  ```
