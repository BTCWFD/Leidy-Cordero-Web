# Handoff Report: Milestone 1 Backend Scaffolding & DB Analysis

## 1. Observation

1.  **Project Root Investigation**:
    *   Using the `find_by_name` and `list_dir` tools, we checked the project root (`c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system`).
    *   Only two files and one directory exist: `ORIGINAL_REQUEST.md`, `PROJECT.md`, and the `.agents/` folder.
    *   No `package.json`, `node_modules`, `server.js`, or `database.js` currently exist in the project root.
2.  **`PROJECT.md` API Contracts** (lines 31-43):
    *   `POST /api/reservas`: Create an appointment. Body: `{ name: string, date: string, time: string, phone: string }`. Returns `{ success: true, bookingId: string }` or error.
    *   `GET /admin/citas`: List appointments. Returns `[{ id: number/string, name: string, date: string, time: string, phone: string }, ...]`.
3.  **`SCOPE.md` (Implementation Track)** (lines 7-14):
    *   Milestone 1 is defined as: "Backend Scaffolding & DB | Initialize packages, express app structure, SQLite/JSON database helper | None | PLANNED".
4.  **`proposed_test_booking.js` (E2E Test Suite from explorer_m1_2)** (lines 18-21, 57-65, 120-168):
    *   Uses CommonJS import: `const test = require('node:test'); const assert = require('node:assert'); const fs = require('node:fs');`.
    *   Spawns `server.js` programmatically passing:
        *   `PORT` environment variable (default: `3001` in tests, default `3000` in production).
        *   `DB_PATH` environment variable (default: `citas_test.json` in tests).
    *   Test cases verify:
        *   `GET /api/disponibilidad?date=YYYY-MM-DD` (Available slots display). Returns an array of slot objects containing `{ time, available }`.
        *   `POST /api/reservas` (Booking submission). Request body matches `PROJECT.md`. Returns `{ success: true, bookingId }`.
        *   `GET /admin/citas?date=YYYY-MM-DD` (Admin citas endpoint). Returns array of bookings filtered or checked for date.
        *   Database file existence and size verification: `fs.statSync(DB_PATH).size > 0`.
5.  **Environment Constraints**:
    *   Running commands to check `node -v` or `npm -v` timed out due to the lack of user permission prompt interaction. We assume a standard Node.js LTS environment (v18+ due to E2E test's use of global `fetch` and `node:test`).

---

## 2. Logic Chain

1.  **Alignment with Test Harness**:
    *   Observation 4 shows that the E2E test harness imports modules using CommonJS (`require()`). Therefore, the backend application (`server.js` and `database.js`) should be designed using CommonJS module syntax (`type: "commonjs"` in `package.json` or omission of `type: "module"`) to guarantee clean, native compatibility.
2.  **Decoupled Database Architecture**:
    *   Observation 4 shows that tests configure the DB using `DB_PATH`.
    *   To support both SQLite and a Zero-Dependency JSON file DB (which avoids Windows native node-gyp compilation issues), we logically conclude that `database.js` must expose a database-agnostic interface (like `init()`, `getBookings(date)`, and `createBooking(booking)`). This abstracts the underlying database engine away from `server.js`.
3.  **Environment Configuration**:
    *   Observation 4 shows the E2E tests run the server in a subprocess by passing `PORT` and `DB_PATH`. Hence, `server.js` must read these environment variables dynamically (`process.env.PORT` and `process.env.DB_PATH`) rather than hardcoding them.
4.  **Endpoint Specifications**:
    *   Observations 2 and 4 define the contract endpoints: `GET /api/disponibilidad?date=...`, `POST /api/reservas`, and `GET /admin/citas?date=...`. Logically, the routes in `server.js` must parse these queries/bodies and return exactly the structures expected by both the project specification and E2E tests.
5.  **Clean Teardowns**:
    *   Observation 4 demonstrates that the test harness terminates the server process using `SIGTERM` and immediately verifies/cleans up the database file. Thus, `server.js` must listen to `SIGTERM` / `SIGINT` signals to close database handles gracefully before exiting.

---

## 3. Caveats

*   **Node.js Version**: The test suite uses `fetch` and `node:test` natively, meaning Node.js version 18+ is required. We assumed Node.js v18+ is installed on the host.
*   **Clinic Working Hours**: We assume a fixed list of working hours/slots (e.g., hourly slots from 09:00 to 17:00, Monday through Saturday, closed on Sundays) to calculate slot availability. If availability rules are dynamic, this logic must be adjusted in `server.js` or `database.js`.
*   **Authentication**: The admin view endpoint `/admin/citas` does not require authentication in the initial contract. If security features are added in later milestones, the route handler must support session/token check middleware.

---

## 4. Conclusion

We recommend the following architecture and structural designs for Milestone 1:

### A. Recommended `package.json` Structure
Create a `package.json` with the following configuration:
*   Use CommonJS (`"type": "commonjs"`).
*   Add dependencies: `express` (web framework) and optionally `sqlite3` (database driver).
*   Define npm scripts to start the server and run tests.

**Proposed `package.json` skeleton:**
```json
{
  "name": "quiropodia-lc-booking-system",
  "version": "1.0.0",
  "description": "Online booking system for Quiropodia LC",
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "test": "node test_booking.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```
*Note: If SQLite is selected, `"sqlite3": "^5.1.7"` should be added to `dependencies`. If JSON file storage is selected, no database dependency is needed.*

---

### B. Recommended `database.js` Interface
Define a database-agnostic interface in `database.js` to decouple storage mechanics from route logic. We propose two design options:

#### Option 1: Zero-Dependency JSON File Storage (Recommended for simplicity and robustness)
This option writes data to a local JSON file specified by `DB_PATH`. It is extremely lightweight, requires zero binary dependencies, and has zero risk of build failures on Windows.

**Structural Sketch:**
```javascript
const fs = require('fs/promises');
const path = require('path');

// Determine database file path from environment variable
const dbPath = path.resolve(process.env.DB_PATH || 'citas.json');

async function init() {
  try {
    await fs.access(dbPath);
  } catch (err) {
    // If file does not exist, initialize with an empty array
    await fs.writeFile(dbPath, JSON.stringify([], null, 2), 'utf-8');
  }
  return true;
}

async function getBookings(date) {
  const data = await fs.readFile(dbPath, 'utf-8');
  const bookings = JSON.parse(data);
  if (date) {
    return bookings.filter(b => b.date === date);
  }
  return bookings;
}

async function createBooking({ name, date, time, phone }) {
  // Read current records
  const data = await fs.readFile(dbPath, 'utf-8');
  const bookings = JSON.parse(data);
  
  // Double-booking check
  const isTaken = bookings.some(b => b.date === date && b.time === time);
  if (isTaken) {
    throw new Error('Slot already booked');
  }
  
  // Create booking
  const newBooking = {
    id: Date.now().toString(), // Or sequence ID
    name,
    date,
    time,
    phone
  };
  
  bookings.push(newBooking);
  
  // Write back to file (flush synchronously or await)
  await fs.writeFile(dbPath, JSON.stringify(bookings, null, 2), 'utf-8');
  return newBooking;
}

async function close() {
  // No persistent connection to close for JSON files
  return true;
}

module.exports = {
  init,
  getBookings,
  createBooking,
  close
};
```

#### Option 2: SQLite-based Storage (`sqlite3`)
Use this option if a SQL relational database is required. Methods must wrap the callback-based `sqlite3` driver in Promises to allow `async/await` syntax in the controller.

**Structural Sketch:**
```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(process.env.DB_PATH || 'citas.db');
let dbConnection = null;

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbConnection.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbConnection.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbConnection.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function init() {
  dbConnection = new sqlite3.Database(dbPath);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      phone TEXT NOT NULL
    )
  `);
  return true;
}

async function getBookings(date) {
  if (date) {
    return allQuery('SELECT * FROM citas WHERE date = ?', [date]);
  }
  return allQuery('SELECT * FROM citas');
}

async function createBooking({ name, date, time, phone }) {
  // Check double-booking
  const existing = await getQuery('SELECT id FROM citas WHERE date = ? AND time = ?', [date, time]);
  if (existing) {
    throw new Error('Slot already booked');
  }
  
  // Use parameterized queries to prevent SQL Injection
  const result = await runQuery(
    'INSERT INTO citas (name, date, time, phone) VALUES (?, ?, ?, ?)',
    [name, date, time, phone]
  );
  
  return {
    id: result.lastID,
    name,
    date,
    time,
    phone
  };
}

async function close() {
  return new Promise((resolve, reject) => {
    if (dbConnection) {
      dbConnection.close((err) => {
        if (err) reject(err);
        else resolve(true);
      });
    } else {
      resolve(true);
    }
  });
}

module.exports = {
  init,
  getBookings,
  createBooking,
  close
};
```

---

### C. Recommended Express App Structure (`server.js`)
`server.js` serves as the entry point for the HTTP web application, parsing middleware, serving static assets, mapping routes, and handling graceful exit hooks.

**Proposed `server.js` structure:**
```javascript
const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Predefined available time slots
const CLINIC_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', 
  '13:00', '14:00', '15:00', '16:00', '17:00'
];

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. Available Slots Route (F1)
app.get('/api/disponibilidad', async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, error: 'Fecha inválida o ausente (formato YYYY-MM-DD)' });
  }

  try {
    // Check if Sunday (closed)
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    if (dayOfWeek === 0) {
      // Clinic is closed on Sundays, return all slots as unavailable
      const closedSlots = CLINIC_SLOTS.map(time => ({ time, available: false }));
      return res.json(closedSlots);
    }

    const bookings = await db.getBookings(date);
    const bookedTimes = new Set(bookings.map(b => b.time));
    
    const slots = CLINIC_SLOTS.map(time => ({
      time,
      available: !bookedTimes.has(time)
    }));
    
    return res.json(slots);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error del servidor al obtener disponibilidad' });
  }
});

// 2. Submit Booking Route (F2/F3)
app.post('/api/reservas', async (req, res) => {
  const { name, date, time, phone } = req.body;
  
  // Validation
  if (!name || !date || !time || !phone) {
    return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ success: false, error: 'Formato de fecha u hora incorrecto' });
  }
  if (!CLINIC_SLOTS.includes(time)) {
    return res.status(400).json({ success: false, error: 'Horario fuera del rango de atención' });
  }

  try {
    const booking = await db.createBooking({ name, date, time, phone });
    return res.status(200).json({ success: true, bookingId: booking.id });
  } catch (error) {
    if (error.message === 'Slot already booked') {
      return res.status(400).json({ success: false, error: 'El horario seleccionado ya está reservado.' });
    }
    return res.status(500).json({ success: false, error: 'Error del servidor al procesar la reserva' });
  }
});

// 3. Admin View Endpoint (F4)
app.get('/admin/citas', async (req, res) => {
  const { date } = req.query;
  try {
    const bookings = await db.getBookings(date);
    // Sort bookings chronologically by time
    bookings.sort((a, b) => a.time.localeCompare(b.time));
    return res.status(200).json(bookings);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error del servidor al obtener las citas' });
  }
});

// Start Server after DB initialization
let serverInstance;
db.init()
  .then(() => {
    serverInstance = app.listen(PORT, () => {
      console.log(`Quiropodia LC Server is listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Graceful Shutdown Handlers (Crucial for test lifecycle control)
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  if (serverInstance) {
    serverInstance.close(async () => {
      console.log('HTTP server closed.');
      await db.close();
      console.log('Database connections closed. Exiting process.');
      process.exit(0);
    });
  } else {
    await db.close();
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## 5. Verification Method

To independently verify the implementation of this architecture:
1.  **Verify Package Scaffolding**:
    *   Inspect `package.json` to confirm `"dependencies"` contains `express` and `"scripts"` contains `"start": "node server.js"`.
2.  **Verify DB Abstraction Integration**:
    *   Inspect `database.js` to ensure it exports the module methods: `init()`, `getBookings(date)`, `createBooking()`, and `close()`.
    *   If using Option 2 (SQLite), confirm all database calls are wrapped in `Promise` boundaries and parameterize input elements (`?`) to pass SQL injection tests.
3.  **Verify Port & Path Injectability**:
    *   Run the command `PORT=3005 DB_PATH=citas_verify.json node server.js` (or PowerShell equivalents).
    *   Confirm the server listens on port `3005` and creates/accesses `citas_verify.json` (or `citas_verify.db`) instead of the default paths.
4.  **Endpoint Integrity & Validation Checks**:
    *   Submit a mock booking to `/api/reservas` and check that:
        *   It persists to the local database file.
        *   The database file is created and its size grows (`size > 0`).
        *   Querying `GET /admin/citas?date=YYYY-MM-DD` returns the booking with its properties.
        *   Re-submitting the exact same booking rejects with status `400` (Double Booking Protection).
5.  **Shutdown Verification**:
    *   Send a `SIGINT` or `SIGTERM` signal to the server process and confirm it logs closing statements and shuts down cleanly without leaving orphaned ports or database handles.
