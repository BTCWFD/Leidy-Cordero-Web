# Explorer 3 Handoff Report - Milestone 1: Backend Scaffolding & DB

## 1. Observation
We analyzed the workspace layout, requirements, and constraints for the backend scaffolding of the Quiropodia LC Booking System.

1.  **Project Root Contents**:
    `list_dir` on `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system` reveals only:
    *   `.agents/` (agent metadata)
    *   `ORIGINAL_REQUEST.md` (incoming explorer request)
    *   `PROJECT.md` (high-level specification and contracts)
    
    *Conclusion*: No `package.json`, `node_modules`, `server.js`, or `database.js` currently exists in the `booking_system/` directory.

2.  **Parent Directory Contents**:
    `list_dir` on `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero` reveals a parent `package.json` and `node_modules` containing:
    ```json
    "dependencies": {
      "basic-ftp": "^6.0.1",
      "dotenv": "^17.4.2"
    }
    ```
    This package is dedicated to deployment scripts (`deploy.js`) and is separate from the booking application itself.

3.  **Project Contracts (`PROJECT.md`)**:
    *   Lines 31-43 specify the API routes:
        *   `POST /api/reservas` -> Request: `{ name, date, time, phone }` -> Response: `{ success: true, bookingId: string }`.
        *   `GET /admin/citas` -> Response: `[{ id, name, date, time, phone }, ...]`.
    *   Lines 24-29 specify that the DB must be a local persistent SQLite or JSON store.

4.  **E2E Test Specifications (`.agents/explorer_m1_2/proposed_test_booking.js`)**:
    *   Line 19: `const PORT = process.env.PORT || '3001';`
    *   Line 20: `const DB_PATH = process.env.DB_PATH || 'citas_test.json';`
    *   Line 123: `const res = await makeRequest('/api/disponibilidad?date=2026-07-01');`
    *   Line 153-157: Checks if the DB file exists and `stats.size > 0` after a successful booking.
    *   Line 161: `const res = await makeRequest('/admin/citas?date=2026-07-01');`
    *   Line 195: Rejects double bookings with `400 Bad Request`.
    *   Line 221: Stores names with SQL characters literally (SQL injection safety).
    *   Line 296-300: Simulates 5 concurrent requests to the same slot; exactly 1 must succeed (200 OK) and 4 must fail (400 Bad Request).

---

## 2. Logic Chain
Based on our observations, we reasoned the following:
1.  **Isolated Scaffolding**: To keep the booking system modular and clean, we must scaffold `package.json` inside the `booking_system/` directory itself, rather than using the parent workspace's package.json.
2.  **Environment Integration**: The server and database helper must respect `process.env.PORT` and `process.env.DB_PATH` to ensure the E2E test runner (`test_booking.js`) can run in isolation without colliding with production ports or database files.
3.  **API Schema Alignment**: The express routes must exactly match the E2E test expectations:
    *   `GET /api/disponibilidad?date=YYYY-MM-DD` (Check availability)
    *   `POST /api/reservas` (Create booking)
    *   `GET /admin/citas` (Admin list, allowing optional filtering via `?date=YYYY-MM-DD`)
4.  **Database Strategy Decision**:
    *   *Option A (SQLite)*: A robust relational database using `sqlite3`. Fits well with SQL syntax, but runs the risk of native compile issues on Windows systems during `npm install`.
    *   *Option B (JSON Persistence)*: A zero-dependency JSON flat-file storage using Node's native `fs` module. 100% portable and easy to maintain.
    *   *Concurrency Handling*: In a multi-user web server, multiple concurrent requests can read the JSON file simultaneously, causing race conditions where a slot is double-booked. To handle the E2E concurrency test, `database.js` must serialize writes using a simple in-memory queue/mutex.

---

## 3. Caveats
*   **Node.js Version**: The `run_command` check for `node --version` timed out because the environment requires user confirmation for terminal execution. However, because the E2E test suite uses built-in `fetch` and `node:test`, we assume Node.js >= v18.0.0 is installed.
*   **Frontend Mocking**: The `public/` directory and static files do not exist yet. `server.js` should set up `express.static('public')` but will gracefully fallback until Milestone 2 is implemented.
*   **Write Restriction**: In compliance with our read-only constraint, we have not created or modified any code files in the project directory.

---

## 4. Conclusion & Architecture Recommendations

We recommend the following architecture for Milestone 1:

### 4.1 package.json Configuration
A clean `package.json` should be initialized inside `booking_system/`.

#### Dependencies:
*   `express`: `^4.19.2` (for web serving and routing)
*   *If choosing SQLite*: `sqlite3`: `^5.1.7` (as the database engine)
*   *If choosing JSON*: No extra dependencies needed.

#### Scripts:
*   `"start": "node server.js"`
*   `"test": "node test_booking.js"`

#### package.json Template:
```json
{
  "name": "quiropodia-lc-booking-system",
  "version": "1.0.0",
  "description": "Booking System for Quiropodia LC Clinic",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node test_booking.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### 4.2 database.js Architecture & Structure
The database module should export high-level operations, keeping the storage mechanism abstract.

#### Shared Settings & Slot Definitions:
The clinic's available hours should be defined as a constant array:
```javascript
const DEFAULT_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
```

#### API Interface Functions:
1.  `initDb()`: Initializes the persistent store (creates the file/schema if it does not exist).
2.  `getSlots(date)`: Returns all default slots, setting `available: false` if a booking exists for that time, and `available: true` otherwise.
3.  `createBooking({ name, date, time, phone })`: Validates slot availability. If available, saves the booking to disk and returns a generated booking ID (e.g. using `crypto.randomUUID()`). Otherwise, throws an error (e.g. "Slot already booked").
4.  `getBookings(date)`: Returns an array of bookings, optionally filtered by date.

#### Implementation Option A: SQLite (using `sqlite3`)
*   **Schema**:
    ```sql
    CREATE TABLE IF NOT EXISTS citas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      phone TEXT NOT NULL,
      UNIQUE(date, time)
    );
    ```
*   **Double-Booking Prevention**: Handled at the database level by the `UNIQUE(date, time)` constraint. The insert query will fail with `SQLITE_CONSTRAINT` if a slot is double-booked, which the code catches and returns as a 400 error.
*   **SQL Injection Safety**: Use parameterized queries (`db.run('INSERT INTO citas VALUES (?, ?, ?, ?, ?)', [id, name, date, time, phone])`) to ensure strings are stored literally.

#### Implementation Option B: JSON Flat-File (Recommended for Portability)
*   **Schema**: A JSON array of objects stored in `DB_PATH`.
    ```json
    [
      {
        "id": "a8f5b3a4-84fa-4d1a-8cfa-5555d44de123",
        "name": "John Doe",
        "date": "2026-07-01",
        "time": "10:00",
        "phone": "123456789"
      }
    ]
    ```
*   **Concurrency Queue**: To prevent two async operations from reading/writing the file simultaneously (violating double-booking rules), implement a promise queue:
    ```javascript
    let writeQueue = Promise.resolve();
    
    function enqueue(action) {
      return new Promise((resolve, reject) => {
        writeQueue = writeQueue.then(async () => {
          try {
            const res = await action();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
    ```
    Wrap file read-check-write operations inside `enqueue(...)` to ensure strict synchronization.

---

### 4.3 server.js Architecture & Structure
The Express server sets up middlewares, handles routing, performs validations, and delegates database operations.

#### Core Structure:
1.  **Imports**: `express`, `path`, `crypto`, and `./database.js`.
2.  **Environment Variables**:
    *   `PORT = process.env.PORT || 3000`
    *   `DB_PATH = process.env.DB_PATH || 'citas.json'`
3.  **Middlewares**:
    *   `express.json()` (Parse incoming JSON bodies)
    *   `express.static(path.join(__dirname, 'public'))` (Serve static frontend files)
4.  **Routing**:
    *   `GET /api/disponibilidad?date=YYYY-MM-DD`
        *   Validate query `date` exists and is formatted.
        *   Call `database.getSlots(date)`.
        *   Return `200 OK` with JSON array.
    *   `POST /api/reservas`
        *   Validate body fields: `name`, `date`, `time`, `phone` must all be non-empty strings.
        *   Call `database.createBooking(...)`.
        *   If successful: Return `200 OK` with `{ success: true, bookingId }`.
        *   If failed due to slot unavailability or validation error: Return `400 Bad Request` with `{ success: false, error: err.message }`.
        *   If failed due to system error: Return `500 Internal Server Error` with `{ success: false, error: err.message }`.
    *   `GET /admin/citas`
        *   Optional query parameter `date`.
        *   Call `database.getBookings(date)`.
        *   Return `200 OK` with JSON array.
5.  **Initialization**:
    *   Call `database.initDb(DB_PATH)` before starting the server.
    *   Listen on `PORT`.

---

## 5. Verification Method

Once the implementer scaffolds the files, they can verify their work using the following sequence:

1.  **Initialize**: Run `npm install` in `booking_system/` to fetch Express.
2.  **Start Dev Server**: Run `node server.js` and verify it boots up and prints that the DB file is initialized.
3.  **Manual Test (Endpoints)**:
    *   Check availability:
        ```bash
        curl "http://localhost:3000/api/disponibilidad?date=2026-07-01"
        ```
    *   Create a booking:
        ```bash
        curl -X POST -H "Content-Type: application/json" -d '{"name":"Jane Doe","date":"2026-07-01","time":"10:00","phone":"555-1234"}' "http://localhost:3000/api/reservas"
        ```
    *   Verify duplicate booking is rejected:
        ```bash
        curl -X POST -H "Content-Type: application/json" -d '{"name":"John Smith","date":"2026-07-01","time":"10:00","phone":"555-4321"}' "http://localhost:3000/api/reservas"
        ```
        (Should return `400 Bad Request` with `{ success: false, error: ... }`)
    *   Verify admin list:
        ```bash
        curl "http://localhost:3000/admin/citas?date=2026-07-01"
        ```
4.  **E2E Test Execution**: Run `node test_booking.js` and ensure all test suites pass.
