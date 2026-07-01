## 2026-06-30T22:42:03Z

You are worker_m5_2. Your working directory is: c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system\.agents\worker_m5_2.
Your task is to fix the regressions, timezone bugs, and semantic corruption handling in `server.js` and `database.js`:

1. Fix phone validation in `server.js` (lines 52-55):
   Remove the restrictive regex check `/^\+?[0-9\s\-]{3,20}$/`.
   Implement a robust phone validation function:
   ```javascript
   function validatePhone(phone) {
     if (typeof phone !== 'string') return false;
     if (phone.length < 3 || phone.length > 30) return false;
     // Allow digits, spaces, hyphens, parentheses, leading +, and optional extension
     const phoneRegex = /^\+?[0-9\s\-()]+(?:\s*(?:ext|x|ext\.)\s*[0-9]+)?$/i;
     if (!phoneRegex.test(phone)) return false;
     const basePart = phone.split(/(?:ext|x|ext\.)/i)[0];
     const digits = basePart.replace(/\D/g, '');
     if (digits.length < 3 || digits.length > 15) return false;
     return true;
   }
   ```
   Call this function in `POST /api/reservas` to validate `phone`. If it returns false, return `400 Bad Request` with:
   `{ success: false, error: 'Invalid phone number format' }`.
   This will ensure that non-standard but valid numbers like `+1 (555) 019-2834 ext 12` pass (fixing the regression on test F2-T2-5) while malformed numbers (like letters, symbols, or pure whitespace/hyphens) are correctly rejected.

2. Fix timezone date mismatch in `server.js` (lines 47-50):
   Instead of comparing date string against `new Date().toISOString().split('T')[0]` (which is in UTC and causes timezone offset skew), construct the local date string `YYYY-MM-DD` and compare against that:
   ```javascript
   const d = new Date();
   const localDateStr = [
     d.getFullYear(),
     String(d.getMonth() + 1).padStart(2, '0'),
     String(d.getDate()).padStart(2, '0')
   ].join('-');
   if (date < localDateStr) {
     return res.status(400).json({ success: false, error: 'Booking date cannot be in the past' });
   }
   ```

3. Fix JSON database semantic corruption in `database.js` (inside `getBookings`, `addBooking`, and `getAllBookings` where JSON is parsed):
   Ensure that when the JSON file is parsed, we verify it is an array using `Array.isArray(bookings)`. If it is not an array, throw a TypeError and treat it as corrupted, resetting the database file to `[]` and returning an empty list `[]` safely so that endpoints do not crash with `500`.
   Example try-catch logic:
   ```javascript
   let bookings = [];
   try {
     const data = fs.readFileSync(jsonDbPath, 'utf8');
     bookings = JSON.parse(data);
     if (!Array.isArray(bookings)) {
       throw new TypeError('Database content is not an array');
     }
   } catch (err) {
     console.warn('JSON database file corrupted, resetting database:', err.message);
     bookings = [];
     fs.writeFileSync(jsonDbPath, JSON.stringify([], null, 2), 'utf8');
   }
   ```

4. Fix SQLite table creation failure crash in `database.js` (around lines 38-48):
   In the table creation callback `(err) => { ... }`, if there is an error creating the table, fall back to the JSON database instead of rejecting:
   ```javascript
   (err) => {
     if (err) {
       console.warn('Failed to create SQLite table, falling back to JSON:', err.message);
       setupJsonDb(dbPath);
       resolve();
     } else {
       dbMode = 'sqlite';
       console.log(`SQLite database initialized successfully at: ${dbPath}`);
       resolve();
     }
   }
   ```

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

After making these changes, run `npm test` or `node test_booking.js` from the project root.
Verify that all 56 tests pass successfully and report the results.

Write your handoff report to `handoff.md` in your working directory and message the Implementation Orchestrator.
