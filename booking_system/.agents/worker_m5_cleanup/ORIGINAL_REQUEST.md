## 2026-06-30T22:53:32Z
You are worker_m5_cleanup. Your working directory is: c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system\.agents\worker_m5_cleanup.
Your task is to implement final hardening checks for phone number validation and JSON database recovery in `server.js` and `database.js`:

1. Hardened JSON parsing validation in `database.js` (inside `getBookings`, `addBooking`, and `getAllBookings` JSON parsing blocks):
   Ensure that after checking `Array.isArray(bookings)`, we iterate over the elements in `bookings` and verify that every element is a valid object containing string fields `name`, `date`, `time`, and `phone`. If any element is not a valid booking object or is missing these fields, throw a TypeError to trigger the database reset recovery logic.
   Update the try-catch block:
   ```javascript
   let bookings = [];
   try {
     const data = fs.readFileSync(jsonDbPath, 'utf8');
     bookings = JSON.parse(data);
     if (!Array.isArray(bookings)) {
       throw new TypeError('Database content is not an array');
     }
     for (const b of bookings) {
       if (!b || typeof b !== 'object' ||
           typeof b.name !== 'string' ||
           typeof b.date !== 'string' ||
           typeof b.time !== 'string' ||
           typeof b.phone !== 'string') {
         throw new TypeError('Database element has invalid schema');
       }
     }
   } catch (err) {
     console.warn('JSON database file corrupted, resetting database:', err.message);
     bookings = [];
     fs.writeFileSync(jsonDbPath, JSON.stringify([], null, 2), 'utf8');
   }
   ```

2. Hardened phone number validation in `server.js` (inside `validatePhone` helper function):
   Add checks to reject phone numbers containing newline (`\n`) or carriage return (`\r`) characters:
   ```javascript
   if (phone.includes('\n') || phone.includes('\r')) return false;
   ```
   This prevents multiline bypasses.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

After making these changes, run `npm test` or `node test_booking.js` to verify all 56 tests pass cleanly.

Write your handoff report to `handoff.md` in your working directory and message the Implementation Orchestrator.
