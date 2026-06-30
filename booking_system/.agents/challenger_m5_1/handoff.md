# Handoff Report: Adversarial Coverage Hardening & Gap Analysis

## 1. Observation

During a white-box analysis of the Quiropodia LC Booking System codebase, the following files were inspected:
- `server.js` (Web server & routing)
- `database.js` (Database persistent module supporting SQLite and JSON)
- `public/client.js` (Client-side logic)
- `public/admin.html` (Admin dashboard rendering)
- `test_booking.js` (E2E Test suite entry point)

### Direct Code Observations:

#### Observation 1: Validation in `server.js` (Lines 19-25)
```javascript
// Simple validation formats
if (typeof name !== 'string' || name.trim() === '' ||
    typeof date !== 'string' || date.trim() === '' ||
    typeof time !== 'string' || time.trim() === '' ||
    typeof phone !== 'string' || phone.trim() === '') {
  return res.status(400).json({ success: false, error: 'Invalid fields format' });
}
```
No validation constraints check the format of `date` (e.g., matching YYYY-MM-DD) or `phone` (e.g., format, digits, or length limit). Additionally, there is no validation to ensure that `date` is a future date.

#### Observation 2: SQL and JSON handling of parameters in `database.js`
In `getBookings(date)` (Lines 77-100):
```javascript
function getBookings(date) {
  if (dbMode === 'sqlite') {
    return new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM citas WHERE date = ?', [date], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      try {
        const data = fs.readFileSync(jsonDbPath, 'utf8');
        const bookings = JSON.parse(data);
        const filtered = bookings.filter(b => b.date === date);
        resolve(filtered);
      } catch (err) {
        reject(err);
      }
    });
  }
}
```
If `date` is passed as an array (e.g. `['2026-08-01', '2026-08-02']`):
- SQLite mode binds the array to `[date]`, resulting in a nested structure `[['2026-08-01', '2026-08-02']]`. The node-sqlite3 driver will fail to bind it properly or query incorrectly, throwing an error and rejecting the promise.
- JSON mode does `b.date === date`, which compares a string `b.date` with an array `date`. This comparison evaluates to `false` and does not throw, returning an empty array `[]`.

#### Observation 3: JSON Mode concurrency implementation in `database.js` (Lines 126-148)
```javascript
} else {
  return new Promise((resolve, reject) => {
    try {
      const data = fs.readFileSync(jsonDbPath, 'utf8');
      const bookings = JSON.parse(data);
      
      // Enforce uniqueness
      const conflict = bookings.find(b => b.date === date && b.time === time);
      if (conflict) {
        return reject(new Error('Double booking detected: this slot is already reserved.'));
      }

      const newId = bookings.length > 0 ? (Math.max(...bookings.map(b => parseInt(b.id || 0, 10))) + 1).toString() : "1";
      const newBooking = { id: newId, name, date, time, phone };
      bookings.push(newBooking);
      
      fs.writeFileSync(jsonDbPath, JSON.stringify(bookings, null, 2), 'utf8');
      resolve({ success: true, bookingId: newId });
    } catch (err) {
      reject(err);
    }
  });
}
```
This performs synchronous, blocking file system operations. If multiple node processes are running (e.g., under a PM2 cluster or containerized replicas), they do not share the same in-memory execution thread and have no file locking mechanism, allowing them to read the JSON file concurrently and overwrite each other.

#### Observation 4: JSON Parsing error handling in `database.js` (Lines 91-92, 129-130, 165-166)
```javascript
const data = fs.readFileSync(jsonDbPath, 'utf8');
const bookings = JSON.parse(data);
```
If the file content of `citas.json` is corrupted or not valid JSON, `JSON.parse` throws an unhandled exception inside the Promise, causing all database-dependent API endpoints (`/api/reservas`, `/admin/citas`, `/api/disponibilidad`) to return `500 Server Error`.

#### Observation 5: Existing E2E Test Suite (`test_booking.js`)
The test suite has 51 cases across 4 tiers. However:
- It tests past date querying (`F1-T2-1`), but does **not** try to create a booking for a past date.
- It tests invalid date format querying (`F1-T2-3`), but does **not** try to create a booking with an invalid date format.
- It tests invalid/complex folder paths (`F3-T2-1`), but does **not** test file corruption in the JSON file.
- It tests concurrency within a single server instance (`F-T3-2`, `F-T4-2`), but does **not** simulate multiple instances/processes accessing the database file.

#### Observation 6: Baseline Test Verification Attempt
An attempt was made to run the E2E tests:
- Command: `node test_booking.js` in `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system`
- Result: The user permission prompt timed out. Therefore, empirical verification of the baseline suite was bypassed due to environment constraints.

---

## 2. Logic Chain

1. **Date Validation Logic**:
   - *Observation 1* shows that the `date` parameter in `POST /api/reservas` is only verified to be a non-empty string.
   - Therefore, a request with `date: "not-a-date"` or `date: "2020-01-01"` (past date) bypasses validation and is successfully added to the database.
   - *Conclusion*: A validation gap exists for date format and future-date enforcement, enabling invalid/retroactive database entries.

2. **Phone Number Validation Logic**:
   - *Observation 1* shows that `phone` is only validated to be a non-empty string.
   - Therefore, an arbitrary string like `phone: "abc"` is persisted.
   - *Conclusion*: A validation gap exists for phone numbers, which can lead to bad data insertion.

3. **Array Parameter Crash/Inconsistency Logic**:
   - *Observation 2* shows that passing an array parameter `date` (e.g. `?date=2026-08-01&date=2026-08-02`) to the database layer causes different behaviors depending on `dbMode`.
   - In SQLite mode, a driver error is thrown (resulting in `500 Server Error`).
   - In JSON mode, a comparison evaluates to `false` (resulting in `200 OK` with an empty result).
   - *Conclusion*: Array parameter injection causes database mode discrepancy and crash vulnerabilities.

4. **Multi-process Concurrency Collision Logic**:
   - *Observation 3* shows that JSON mode uses synchronous file system writes, which are blocking but lack system-level file locks.
   - If two processes concurrently process bookings, they can read the same state, see no conflict, and write, resulting in one overwriting the other (lost update) or a double booking.
   - *Conclusion*: JSON database mode is vulnerable to race conditions under multi-process or clustered deployments.

5. **JSON Corruption Crash Logic**:
   - *Observation 4* shows that `JSON.parse` is called directly on file contents without recovery logic.
   - If the database file is corrupted, any operation on the database throws a SyntaxError, rejecting the promise and crashing the API endpoints with a `500` status.
   - *Conclusion*: The JSON mode is highly susceptible to unrecovered crashes upon file corruption.

---

## 3. Caveats

- **No empirical execution**: Baseline tests and new tests could not be run because the automated `run_command` timed out waiting for user approval.
- **Node-sqlite3 driver specific behavior**: The exact exception thrown in SQLite mode when binding a nested array depends on the installed version of `sqlite3`. It was assumed to reject/error out based on typical driver behavior.

---

## 4. Conclusion

The current E2E test suite in `test_booking.js` provides good coverage for happy paths and basic validation limits, but contains gaps around **adversarial validation bypassing**, **database-level concurrency**, and **API parameter type injection**. 

To harden the system, the following **6 new adversarial E2E test cases** have been designed:

### Proposed Adversarial Test Cases:

#### 1. F2-ADV-1: Past Date Booking Restriction
- **Scenario**: Attempt to book an appointment with a date in the past (e.g., `2020-01-01`).
- **Input**: `POST /api/reservas` with `{ name: "Retro Patient", date: "2020-01-01", time: "10:00", phone: "123" }`
- **Expected Behavior**: Response `400 Bad Request` with error message indicating bookings must be in the future.
- **Goal**: Verify backend validation prevents retroactive bookings.

#### 2. F2-ADV-2: Malformed Date Format Rejection
- **Scenario**: Attempt to book an appointment with an invalid date string format (e.g. `"not-a-date"` or `"01-12-2026"`).
- **Input**: `POST /api/reservas` with `{ name: "Invalid Date Patient", date: "not-a-date", time: "10:00", phone: "123" }`
- **Expected Behavior**: Response `400 Bad Request` indicating the date format is invalid (must be YYYY-MM-DD).
- **Goal**: Verify strict date format validation.

#### 3. F2-ADV-3: Malformed Phone Number Rejection
- **Scenario**: Attempt to book an appointment with an invalid phone format (e.g., letters or symbols instead of digits).
- **Input**: `POST /api/reservas` with `{ name: "Invalid Phone Patient", date: "2026-08-01", time: "10:00", phone: "abcdef" }`
- **Expected Behavior**: Response `400 Bad Request` indicating phone number must be valid.
- **Goal**: Verify phone format checking.

#### 4. F4-ADV-4: Array Query Parameter Abuse
- **Scenario**: Query `/admin/citas` and `/api/disponibilidad` with an array of dates to check for crash resilience and consistent responses.
- **Input**: `GET /admin/citas?date=2026-08-01&date=2026-08-02`
- **Expected Behavior**: The server should return `400 Bad Request` or extract the first parameter safely, and behave identically in both SQLite and JSON database modes.
- **Goal**: Verify query parameter type safety.

#### 5. F3-ADV-5: JSON Database Corruption Recovery
- **Scenario**: Corrupt the JSON database file manually and attempt to query the API.
- **Input**: Write invalid characters like `{invalid_json` to `citas_test.json`, then call `GET /admin/citas`.
- **Expected Behavior**: The server should handle the syntax error gracefully (re-initialize the DB file or return a clean JSON error response, rather than throwing an unhandled exception).
- **Goal**: Verify storage error-recovery and stability.

#### 6. F3-ADV-6: Multi-Instance File Locking Race Condition (JSON mode)
- **Scenario**: Simulate two separate worker threads/processes trying to book the exact same slot concurrently in JSON database mode.
- **Input**: Launch two concurrent operations that read `citas.json`, delay slightly, and write to it.
- **Expected Behavior**: One operation must fail due to file-locking or transactional consistency.
- **Goal**: Verify concurrency protection across separate process instances.

---

## 5. Verification Method

To verify these findings and execute the baseline tests:
1. Open a PowerShell terminal in the workspace directory:
   `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system`
2. Run the existing test suite:
   ```bash
   node test_booking.js
   ```
3. To implement the proposed adversarial tests, append the designed test cases using `node:test` framework under a `test.describe('Tier 5: Adversarial Hardening', ...)` section in `test_booking.js`, and execute the test command again to observe the failures (verifying the gaps exist before fixing them).
