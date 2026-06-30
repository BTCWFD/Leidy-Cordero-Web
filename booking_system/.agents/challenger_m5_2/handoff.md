# Handoff Report: Adversarial Coverage Hardening

## 1. Observation
After performing a white-box analysis of `server.js` and `database.js` in relation to the E2E tests in `test_booking.js`, the following specific implementation patterns were observed:

1. **Date Validation Gaps (`server.js`, Lines 15–25)**:
   ```javascript
   15:     const { name, date, time, phone } = req.body;
   16:     if (!name || !date || !time || !phone) {
   17:       return res.status(400).json({ success: false, error: 'Missing required fields: name, date, time, phone' });
   18:     }
   19:     // Simple validation formats
   20:     if (typeof name !== 'string' || name.trim() === '' ||
   21:         typeof date !== 'string' || date.trim() === '' ||
   22:         typeof time !== 'string' || time.trim() === '' ||
   23:         typeof phone !== 'string' || phone.trim() === '') {
   24:       return res.status(400).json({ success: false, error: 'Invalid fields format' });
   25:     }
   ```
   No standard date format verification (e.g., `YYYY-MM-DD`) or value validation (checking for past dates, invalid dates like Feb 30th) exists. Any non-empty string is accepted.

2. **Query Parameter Type Mismatch (`server.js`, Lines 44–53, 59–67 & `database.js`, Lines 77–99)**:
   ```javascript
   44: app.get('/admin/citas', async (req, res) => {
   45:   try {
   46:     const { date } = req.query;
   ```
   Express parses duplicate query parameters as arrays (e.g., `?date=2026-08-01&date=2026-08-02`). In `database.js`:
   ```javascript
   80:       sqliteDb.all('SELECT * FROM citas WHERE date = ?', [date], (err, rows) => {
   ```
   Passing an array parameter `date` into `sqliteDb.all`'s bindings causes driver failures, while in JSON mode it causes `b.date === date` to compare a string to an array (always returning `[]`).

3. **Auto-Increment ID Pollution / NaN Propagation (`database.js`, Line 138)**:
   ```javascript
   138:         const newId = bookings.length > 0 ? (Math.max(...bookings.map(b => parseInt(b.id || 0, 10))) + 1).toString() : "1";
   ```
   If a single booking in the JSON database contains a non-numeric or missing `id` (e.g., modified manually or corrupted), `parseInt` returns `NaN`. `Math.max` over an array with `NaN` evaluates to `NaN`, rendering all subsequent booking IDs as the string `"NaN"`, leading to key collision.

4. **Async Callback Uncaught Exception Crash (`database.js`, Lines 22–26 & Lines 70–73)**:
   ```javascript
   22:       sqliteDb = new sqlite3.Database(dbPath, (err) => {
   23:         if (err) {
   24:           console.warn('Failed to open SQLite database, falling back to JSON:', err.message);
   25:           setupJsonDb(dbPath);
   26:           resolve();
   ```
   If SQLite initialization fails asynchronously (e.g., during file creation), the fallback `setupJsonDb(dbPath)` is triggered inside the async callback. If `setupJsonDb` throws an error due to invalid path syntax (e.g., directory creation failure at line 70: `ensureDir(jsonDbPath)`), the error is thrown inside an asynchronous callback with no surrounding try-catch. This causes Node.js to terminate with an uncaught exception crash.

5. **Information Disclosure via Raw Errors (`server.js`, Lines 34–40)**:
   ```javascript
   34:   } catch (err) {
   35:     if (err.message.includes('Double booking detected')) {
   36:       res.status(400).json({ success: false, error: err.message });
   37:     } else {
   38:       res.status(500).json({ success: false, error: err.message });
   39:     }
   40:   }
   ```
   Internal SQLite/JSON engine error strings are returned directly in the response payload.

6. **Missing JSON Parser Custom Error Handling**:
   Express parses requests using `express.json()`. If a client POSTs a malformed JSON payload (e.g., `{ "name": "John", }` with `Content-Type: application/json`), Express throws an error before reaching the endpoint logic, serving a default HTML page containing the raw stack trace.

7. **JSON Database Cross-Instance Concurrency**:
   `database.js` reads and writes JSON using `fs.readFileSync` and `fs.writeFileSync`. It has no file locking. If multiple processes (e.g., PM2 clusters) read and write to the same database file concurrently, they will overwrite each other's updates.

8. **Phone Number Format Validation Gap**:
   Any non-empty string is accepted as `phone` in `server.js` line 23. No regex checks or length constraints are applied.

---

## 2. Logic Chain
1. *F2: Patient Booking Submission* validates `date` and `phone` strictly by checking if they are strings of length > 0.
2. Therefore, patients can successfully book slots in the past (e.g., `date: "2000-01-01"`) or with invalid formats (e.g., `date: "not-a-date"`, `phone: "abcdefgh"`).
3. The lack of parameter validation allows passing query params like `?date=2026-08-01&date=2026-08-02` which Express parses as an array. In SQLite mode, this results in type-mismatch errors in SQL binding, and in JSON mode, it silences results.
4. Auto-increment ID logic in JSON mode relies on `Math.max` over parsed IDs. If any ID parses to `NaN`, subsequent allocations break.
5. SQLite initialization errors inside the database driver's async callbacks trigger `setupJsonDb`. Throwing errors there is uncaught by the startup routine's main try-catch, causing full process failure.

---

## 3. Caveats
- Evaluated codebase and test suite via static code analysis. Did not execute live tests due to permission prompts.
- Assumed standard Node.js Express query parsing behavior for array structures.

---

## 4. Conclusion
While the E2E suite (`test_booking.js`) correctly exercises the basic functionality and boundaries (51 cases), it does not cover adversarial inputs targeting the parsing tier, ID calculation bugs, past-date bookings, array query crashes, or uncaught exception paths. Implementing validation checks and securing JSON ID parsing will prevent application degradation.

---

## 5. Verification Method (Proposed Adversarial Tests)
We design the following new test cases to verify these gaps. These should be appended to the test suite (without modifying existing source files for this review phase).

### Test Suite Addition: Tier 5 (Adversarial Coverage Hardening)

#### Test Case 1: Post Booking with Invalid Date Format
- **Description**: POST a booking with `date` set to a non-standard string like `'not-a-date'`.
- **Expected**: Reject with `400 Bad Request`.

#### Test Case 2: Post Booking with Past Date
- **Description**: POST a booking with `date` set to a past date like `'2020-01-01'`.
- **Expected**: Reject with `400 Bad Request`.

#### Test Case 3: Query Availability with Array Parameter
- **Description**: Query `GET /api/disponibilidad?date=2026-08-01&date=2026-08-02`.
- **Expected**: Return `400 Bad Request` or handle gracefully by selecting only the first date string, rather than throwing `500 Server Error`.

#### Test Case 4: JSON ID Autoincrement Recovery under NaN Pollution
- **Description**: Corrupt a record in the test JSON database file to have `id: "invalid-id"`. POST a new booking and check if the generated `bookingId` is a valid incremented integer rather than `"NaN"`.
- **Expected**: The system recovers and increments correctly.

#### Test Case 5: POST Malformed JSON Payload
- **Description**: Send a POST request to `/api/reservas` with `Content-Type: application/json` but a malformed JSON string (e.g. `{ name: "John"`).
- **Expected**: Server handles gracefully with a JSON error response rather than an HTML stack trace.

#### Test Case 6: Post Booking with Invalid Phone Format
- **Description**: POST a booking with `phone` set to a string containing alphabetic characters or length > 50.
- **Expected**: Reject with `400 Bad Request`.
