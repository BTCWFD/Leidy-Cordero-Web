# Handoff Report: Backend Scaffolding & Database Architecture Design

## 1. Observation
The following details were observed from the directory structures and project files:
1. **Empty Project Root**: A directory search on the root path `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system` shows only:
   - `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system\PROJECT.md`
   - `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero\booking_system\ORIGINAL_REQUEST.md`
   - There is no `package.json`, `node_modules`, or database files in the root directory.
2. **Parent Workspace Setup**: The parent directory `c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero` contains:
   - `package.json` with CommonJS type: `"type": "commonjs"`.
   - `node_modules/` and a lockfile indicating a standard Node.js/CommonJS environment.
3. **Interface Contracts (from `PROJECT.md` and `explorer_m1_1/proposed_TEST_INFRA.md`)**:
   - `POST /api/reservas`: Body: `{ name, date, time, phone }`. Success response: `{ success: true, bookingId }`. Error: `{ success: false, error }`.
   - `GET /admin/citas`: Success response: array of booking objects `[{ id, name, date, time, phone }, ...]`.
   - `GET /api/disponibilidad?date=YYYY-MM-DD`: Success response: array of available time slots `["09:00", "10:00", ...]`. Error: `{ success: false, error }`.
4. **Database Requirements**:
   - `PROJECT.md` states: "Database Engine: Local persistent SQLite/JSON store. Requires no credentials."
   - The environment variable `DATABASE_PATH` will configure the database location (e.g. `citas.json` or `database.sqlite`).

---

## 2. Logic Chain
1. **Module Format Alignment**: The parent package is configured as `"type": "commonjs"`. To ensure compatibility, prevent syntax mismatch issues, and align with standard Express templates, the `package.json` in the `booking_system/` root should use standard CommonJS module syntax (`require`/`module.exports`).
2. **Environment Configuration**: The backend must run under various ports and database files (especially for parallel testing or isolated test runs). The application should load `PORT` and `DATABASE_PATH` from environment variables, defaulting to port `3000` and `citas.json` (or `database.sqlite`) respectively.
3. **Double Booking Prevention**:
   - In SQLite, double booking can be prevented at the database level by declaring a `UNIQUE(date, time)` constraint. This ensures transactional safety, even under concurrent race conditions (TC-CROSS-02 in E2E spec).
   - In a simple JSON store, checking slot availability must occur before appending a new booking, and write access should be synchronized (e.g., using synchronous filesystem calls or an in-memory execution queue) to prevent file write collisions.
4. **Static UI Integration**: The Patient UI resides in `public/` (Milestone 3). Express's built-in `express.static('public')` middleware will seamlessly mount the frontend folder at the root path `/`.

---

## 3. Caveats
- **Compilation Risks on Windows**: Installing `sqlite3` or `better-sqlite3` on Windows machines can occasionally trigger compilation issues if Python build tools or C++ compiler components are missing. Therefore, providing a zero-dependency JSON database persistence implementation as a fallback/primary option is highly recommended to ensure the environment works "out of the box".
- **Authentication**: No authentication is defined in `PROJECT.md` for `/admin/citas`. The designs below assume public endpoints. If auth is introduced later, middlewares can be added to `server.js` without altering database schemas.

---

## 4. Conclusion & Recommended Architecture

We recommend the following scaffolding and architecture for Milestone 1.

### A. Recommended `package.json` Structure
Create a standard CommonJS `package.json` file in the root.
* If using the **SQLite** approach, add `"sqlite3": "^5.1.7"` as a dependency.
* If using the **JSON** approach, keep it zero-dependency or add simple helper libraries.
* Include scripts to run the server and trigger the test harness.

**Suggested `package.json` Structure:**
```json
{
  "name": "quiropodia-lc-booking-system",
  "version": "1.0.0",
  "description": "Quiropodia LC Booking System backend scaffolding",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node test_booking.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "sqlite3": "^5.1.7"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### B. Recommended `database.js` Structure
We provide two structural designs for the database helper. **SQLite** is recommended for race-condition prevention, while **JSON** is recommended for portability.

#### Option 1: SQLite Persistence (Recommended)
This approach leverages SQLite transactions and database-level constraints.

```javascript
const sqlite3 = require('sqlite3').verbose();
let db = null;

/**
 * Initializes the database, creating the file and tables if they do not exist.
 * @param {string} dbPath - Path to the SQLite database file.
 * @returns {Promise<void>}
 */
function initDb(dbPath) {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      
      const query = `
        CREATE TABLE IF NOT EXISTS citas (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          phone TEXT NOT NULL,
          UNIQUE(date, time)
        );
      `;
      
      db.run(query, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

/**
 * Retrieves bookings from the database.
 * @param {string} [date] - Optional date in YYYY-MM-DD format to filter bookings.
 * @returns {Promise<Array>}
 */
function getBookings(date) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT id, name, date, time, phone FROM citas';
    const params = [];
    
    if (date) {
      query += ' WHERE date = ?';
      params.push(date);
    }
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Inserts a new booking into the database.
 * The UNIQUE(date, time) constraint will reject double-bookings.
 * @param {Object} booking - { id, name, date, time, phone }
 * @returns {Promise<void>}
 */
function addBooking(booking) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO citas (id, name, date, time, phone)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(
      query, 
      [booking.id, booking.name, booking.date, booking.time, booking.phone],
      function (err) {
        if (err) {
          // Check for SQLite unique constraint error
          if (err.message.includes('UNIQUE constraint failed')) {
            reject(new Error('Slot already booked'));
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports = {
  initDb,
  getBookings,
  addBooking
};
```

#### Option 2: JSON Persistence (Zero-Dependency Fallback)
This approach reads and writes to a JSON file. Writes are synchronous to avoid concurrent filesystem conflicts.

```javascript
const fs = require('fs');
const path = require('path');

let databaseFile = null;

function initDb(dbPath) {
  databaseFile = dbPath;
  if (!fs.existsSync(databaseFile)) {
    fs.writeFileSync(databaseFile, JSON.stringify([], null, 2), 'utf8');
  }
}

function getBookings(date) {
  const data = fs.readFileSync(databaseFile, 'utf8');
  const bookings = JSON.parse(data || '[]');
  if (date) {
    return bookings.filter(b => b.date === date);
  }
  return bookings;
}

function addBooking(booking) {
  const data = fs.readFileSync(databaseFile, 'utf8');
  const bookings = JSON.parse(data || '[]');
  
  // Check if slot is already booked
  const exists = bookings.some(b => b.date === booking.date && b.time === booking.time);
  if (exists) {
    throw new Error('Slot already booked');
  }
  
  bookings.push(booking);
  fs.writeFileSync(databaseFile, JSON.stringify(bookings, null, 2), 'utf8');
}

module.exports = {
  initDb,
  getBookings,
  addBooking
};
```

---

### C. Recommended `server.js` Structure
The server script initializes the Express application, configures middleware, defines routing matching the contracts, and hooks up the database engine.

```javascript
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'citas.json');

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Define Business Hours / Default Slots
const CLINIC_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

/**
 * GET /api/disponibilidad
 * Query params: ?date=YYYY-MM-DD
 */
app.get('/api/disponibilidad', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: 'Date parameter is required' });
    }
    
    // Basic date format validation (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // Get existing bookings for this date
    const bookings = await db.getBookings(date);
    const bookedTimes = bookings.map(b => b.time);
    
    // Filter out booked times from standard clinic slots
    const availableSlots = CLINIC_SLOTS.filter(slot => !bookedTimes.includes(slot));
    
    return res.json(availableSlots);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reservas
 * Body: { name, date, time, phone }
 */
app.post('/api/reservas', async (req, res, next) => {
  try {
    const { name, date, time, phone } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Valid date is required' });
    }
    if (!time || !CLINIC_SLOTS.includes(time)) {
      return res.status(400).json({ success: false, error: 'Valid clinic slot is required' });
    }
    if (!phone || !phone.trim() || phone.length < 5) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required' });
    }
    
    // Generate UUID/String ID
    const bookingId = crypto.randomUUID();
    const newBooking = { id: bookingId, name, date, time, phone };
    
    // Insert into DB
    await db.addBooking(newBooking);
    
    return res.status(200).json({ success: true, bookingId });
  } catch (error) {
    if (error.message === 'Slot already booked') {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * GET /admin/citas
 */
app.get('/admin/citas', async (req, res, next) => {
  try {
    const { date } = req.query; // optional date filtering
    const bookings = await db.getBookings(date);
    return res.json(bookings);
  } catch (error) {
    next(error);
  }
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Initialize DB and start server
async function start() {
  try {
    await db.initDb(DATABASE_PATH);
    console.log(`Database initialized at: ${DATABASE_PATH}`);
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only run if server.js is executed directly
if (require.main === module) {
  start();
}

module.exports = { app, start };
```

---

## 5. Verification Method
To verify that this scaffolding architecture functions correctly once implemented:

1. **Syntax & Lints**: Ensure code matches CommonJS syntax.
2. **Execute Scaffolding Checks**:
   - Run `node -e "require('./database')"` inside `booking_system/` and confirm no syntax errors.
   - Run `node -e "require('./server')"` inside `booking_system/` and confirm Express exports properly.
3. **Run with Environment Variables**:
   - Run the server specifying a port and a temporary database file:
     ```powershell
     $env:PORT="4000"
     $env:DATABASE_PATH="test_db.sqlite" # or "test_db.json"
     node server.js
     ```
   - Check if `test_db.sqlite` or `test_db.json` is created in the directory.
   - Confirm server responds to `curl http://localhost:4000/api/disponibilidad?date=2026-07-01` returning `["09:00", ...]`
