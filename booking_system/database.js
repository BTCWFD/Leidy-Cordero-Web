const fs = require('fs');
const path = require('path');

let dbMode = 'sqlite'; // 'sqlite' or 'json'
let sqliteDb = null;
let jsonDbPath = null;

// Helper to check/ensure directories exist
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initDb(dbPath) {
  return new Promise((resolve, reject) => {
    // Try SQLite first
    try {
      if (process.env.FORCE_JSON_DB === 'true') {
        throw new Error('Forced JSON mode via environment variable');
      }
      const sqlite3 = require('sqlite3').verbose();
      ensureDir(dbPath);
      sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.warn('Failed to open SQLite database, falling back to JSON:', err.message);
          if (sqliteDb) {
            try {
              sqliteDb.close();
            } catch (closeErr) {
              // Ignore close error on open failure
            }
            sqliteDb = null;
          }
          setupJsonDb(dbPath);
          resolve();
        } else {
          sqliteDb.configure("busyTimeout", 3000);
          // Create table
          sqliteDb.run(
            `CREATE TABLE IF NOT EXISTS citas (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              date TEXT NOT NULL,
              time TEXT NOT NULL,
              phone TEXT NOT NULL,
              UNIQUE(date, time)
            )`,
            (err) => {
              if (err) {
                console.warn('Failed to create SQLite table, falling back to JSON:', err.message);
                if (sqliteDb) {
                  try {
                    sqliteDb.close();
                  } catch (closeErr) {
                    console.warn('Error closing sqlite database:', closeErr.message);
                  }
                  sqliteDb = null;
                }
                setupJsonDb(dbPath);
                resolve();
              } else {
                dbMode = 'sqlite';
                console.log(`SQLite database initialized successfully at: ${dbPath}`);
                resolve();
              }
            }
          );
        }
      });
    } catch (err) {
      console.warn('sqlite3 module not available or failed to load. Falling back to JSON database:', err.message);
      if (sqliteDb) {
        try {
          sqliteDb.close();
        } catch (closeErr) {
          // Ignore
        }
        sqliteDb = null;
      }
      setupJsonDb(dbPath);
      resolve();
    }
  });
}

function setupJsonDb(dbPath) {
  dbMode = 'json';
  // Use dbPath but replace extension with .json if it ends with .db or .sqlite
  let targetPath = dbPath;
  if (dbPath.endsWith('.sqlite') || dbPath.endsWith('.db')) {
    targetPath = dbPath.substring(0, dbPath.lastIndexOf('.')) + '.json';
  } else if (!dbPath.endsWith('.json')) {
    targetPath = path.join(path.dirname(dbPath), 'citas.json');
  }
  jsonDbPath = targetPath;
  ensureDir(jsonDbPath);
  if (!fs.existsSync(jsonDbPath)) {
    fs.writeFileSync(jsonDbPath, JSON.stringify([], null, 2), 'utf8');
  }
  console.log(`JSON database initialized successfully at: ${jsonDbPath}`);
}

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
        const filtered = bookings.filter(b => b.date === date);
        resolve(filtered);
      } catch (err) {
        reject(err);
      }
    });
  }
}

function addBooking(booking) {
  const { name, date, time, phone } = booking;
  if (!name || !date || !time || !phone) {
    return Promise.reject(new Error('Missing required booking fields'));
  }

  if (dbMode === 'sqlite') {
    return new Promise((resolve, reject) => {
      sqliteDb.run(
        'INSERT INTO citas (name, date, time, phone) VALUES (?, ?, ?, ?)',
        [name, date, time, phone],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              reject(new Error('Double booking detected: this slot is already reserved.'));
            } else {
              reject(err);
            }
          } else {
            resolve({ success: true, bookingId: this.lastID.toString() });
          }
        }
      );
    });
  } else {
    return new Promise((resolve, reject) => {
      try {
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
}

function getAllBookings() {
  if (dbMode === 'sqlite') {
    return new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM citas ORDER BY date ASC, time ASC', [], (err, rows) => {
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
        bookings.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return a.time.localeCompare(b.time);
        });
        resolve(bookings);
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = {
  initDb,
  getBookings,
  addBooking,
  getAllBookings,
  getMode: () => dbMode
};
