# Handoff Report

## 1. Observation
During the adversarial review of `server.js` and `database.js`, we executed static analysis and logic tracing of the code. We also attempted to run the test suite `node test_booking.js` but encountered command permission timeouts:
```
Encountered error in step execution: Permission prompt for action 'command' on target 'node test_booking.js' timed out waiting for user response.
```
Consequently, all findings are verified through strict empirical logic tracing of the source code.

Specific code sections inspected:
- **Timezone check in past dates (`server.js:48`)**:
  ```javascript
  if (date < new Date().toISOString().split('T')[0]) {
  ```
- **Calendar leap-year check (`server.js:40-45`)**:
  ```javascript
  const calendarDate = new Date(year, month - 1, day);
  if (calendarDate.getFullYear() !== year || 
      (calendarDate.getMonth() + 1) !== month || 
      calendarDate.getDate() !== day) {
  ```
- **Phone number regex check (`server.js:53`)**:
  ```javascript
  if (!/^\+?[0-9\s\-]{3,20}$/.test(phone)) {
  ```
- **JSON DB corruption parser (`database.js:98-106`)**:
  ```javascript
  try {
    bookings = JSON.parse(data);
  } catch (parseErr) {
    if (parseErr instanceof SyntaxError) {
      console.warn('JSON database corrupted, resetting to empty array:', parseErr.message);
      bookings = [];
      fs.writeFileSync(jsonDbPath, JSON.stringify(bookings, null, 2), 'utf8');
    } else {
      throw parseErr;
    }
  }
  ```
- **SQLite DB initialization (`database.js:25-54`, `server.js:115-125`)**:
  ```javascript
  sqliteDb = new sqlite3.Database(dbPath, (err) => { ... });
  // in server.js
  db.initDb(DATABASE_PATH)
    .catch(err => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
  ```

---

## 2. Logic Chain

### Finding 1: Timezone Past-Date Validation Bypass / False Positives
- **Premise**: `server.js:48` compares string format dates using `new Date().toISOString().split('T')[0]` which evaluates to the current UTC date.
- **Reasoning**:
  1. If the server is located in a timezone behind UTC (e.g. EST/UTC-5) and the current local time is 9:00 PM on June 30, 2026, the UTC time is already 2:00 AM on July 1, 2026.
  2. The check `date < "2026-07-01"` for a valid local appointment on `"2026-06-30"` evaluates to `true` (since `"2026-06-30"` < `"2026-07-01"`).
  3. The booking is blocked as "in the past", generating a false positive.
  4. If the server is in a timezone ahead of UTC (e.g. UTC+5) and the local time is 2:00 AM on July 1, 2026, the UTC date is still June 30, 2026.
  5. The check `date < "2026-06-30"` for a booking on `"2026-06-30"` (which is yesterday locally) evaluates to `false`.
  6. The booking for a past day is accepted, bypassing the validation.

### Finding 2: Two-Digit Year Rejection for Valid Historical Leap Years
- **Premise**: `server.js:40-45` checks calendar validity using `calendarDate.getFullYear() !== year` against the parsed year.
- **Reasoning**:
  1. The JS `Date` constructor treats two-digit years (0 to 99) as relative to the 1900s (e.g. `new Date(80, 1, 29)` creates a Date object representing Feb 29, 1980).
  2. If a user submits `0080-02-29` (which is a valid leap year date), `calendarDate.getFullYear()` evaluates to `1980`.
  3. Since `1980 !== 80`, the validation fails and returns `400 Bad Request` ("Invalid calendar date").

### Finding 3: Phone Number Non-Numeric Validation Bypass
- **Premise**: `server.js:53` checks `phone` format using regex `/^\+?[0-9\s\-]{3,20}$/` and trim checks.
- **Reasoning**:
  1. The regex permits any characters in `[0-9\s\-]` with optional leading `+`, but never requires at least one digit.
  2. The input `phone = "---"` has length 3, consisting only of hyphens, and is not empty when trimmed.
  3. It matches both validations, bypassing any numeric requirements and storing completely invalid phone records.

### Finding 4: Unhandled JSON Database Semantic Corruption
- **Premise**: `database.js:98-106` catches `SyntaxError` on `JSON.parse` and writes `[]` to the database file.
- **Reasoning**:
  1. If the database file is written with valid JSON syntax but is not an array (e.g. `"null"`, `"{}"`, `"123"`, `"true"`), `JSON.parse` executes successfully without throwing `SyntaxError`.
  2. Substantive array functions like `bookings.filter`, `bookings.find`, and `bookings.sort` will then attempt to execute on the non-array parsed value.
  3. This throws `TypeError` (e.g., `TypeError: bookings.filter is not a function`), which propagates as a `500 Server Error`.
  4. Because the error is thrown outside the parsing try-catch block, the database file is never reset or repaired, leaving the application permanently broken.

### Finding 5: SQLite Database Corruption Crash
- **Premise**: `database.js:18-30` initializes SQLite and rejects the initialization promise if the database table cannot be created.
- **Reasoning**:
  1. If the SQLite file is corrupted such that table creation queries fail, `initDb` rejects the promise.
  2. `server.js:124` handles the rejection by printing the error and calling `process.exit(1)`.
  3. The server terminates immediately, with no fallback to JSON database mode or database regeneration.

---

## 3. Caveats
- No dynamic execution was performed because of user/environment terminal approval timeouts. All findings are derived from static analysis of code logic.
- We assume that the server is intended to run in a single-process timezone-naive context, and timezone discrepancies are therefore bugs.
- We assume the environment is Node.js >= 18 as described in `TEST_INFRA.md`.

---

## 4. Conclusion
The system successfully implements basic validation and corruption recovery, but exposes several edge-case vulnerabilities and robustness bugs under adversarial scrutiny:
1. Timezone mismatches allow patients to book past dates or block current-day bookings.
2. Phone number validation allows completely non-numeric phone values.
3. JSON corruption recovery leaves the system in a permanently wedged state if the file contains syntactically valid but semantically corrupt JSON (like `null`, `{}`, `123`).
4. SQLite corruption prevents server startup.

---

## 5. Verification Method
To verify these bugs once terminal permission is granted, run the following HTTP/shell commands:

1. **Verify Phone Validation Bypass**:
   ```bash
   curl -X POST http://localhost:3001/api/reservas \
     -H "Content-Type: application/json" \
     -d '{"name": "Bypass Phone", "date": "2026-08-01", "time": "10:00", "phone": "---"}'
   # Expected: 400 Bad Request
   # Actual: 200 OK
   ```

2. **Verify JSON Semantic Corruption Wedge**:
   - Write `"null"` to the test database file: `echo null > citas_test.json`
   - Run `curl http://localhost:3001/api/disponibilidad?date=2026-08-01`
   - Expected: 200 OK (with empty/healed database)
   - Actual: 500 Server Error (permanently wedged database)
