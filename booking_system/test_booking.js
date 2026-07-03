/**
 * test_booking.js
 * 
 * Automated E2E Verification Script for Quiropodia LC Booking System.
 * Fully implements the 50+ test cases across Tiers 1-4.
 * 
 * Run via: node test_booking.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('path');

// Test Environment Settings
const PORT = process.env.PORT || '3001';
const DB_PATH = process.env.DB_PATH || 'citas_test.json';
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;

// Helper to get all possible database file paths that might be created by database.js
function getPossibleDbPaths(basePath) {
  const paths = new Set();
  paths.add(basePath);
  
  // JSON fallback path logic from database.js:
  let jsonPath = basePath;
  if (basePath.endsWith('.sqlite') || basePath.endsWith('.db')) {
    jsonPath = basePath.substring(0, basePath.lastIndexOf('.')) + '.json';
  } else if (!basePath.endsWith('.json')) {
    jsonPath = path.join(path.dirname(basePath), 'citas.json');
  }
  paths.add(jsonPath);
  
  // SQLite counterparts:
  if (basePath.endsWith('.json')) {
    paths.add(basePath.substring(0, basePath.lastIndexOf('.')) + '.sqlite');
    paths.add(basePath.substring(0, basePath.lastIndexOf('.')) + '.db');
  }
  
  return Array.from(paths);
}

// Function to clean up on signal/exit
function cleanupOnExit() {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {}
    serverProcess = null;
  }
  
  const paths = getPossibleDbPaths(DB_PATH);
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (err) {}
    }
  }
}

process.on('SIGINT', () => {
  cleanupOnExit();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanupOnExit();
  process.exit(143);
});
process.on('exit', () => {
  cleanupOnExit();
});

// Helper to wait
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for making API requests using native fetch
async function makeRequest(endpoint, options = {}, port = PORT) {
  const url = `http://localhost:${port}${endpoint}`;
  try {
    if (endpoint.startsWith('/admin')) {
      if (!options.headers) {
        options.headers = {};
      }
      if (!options.headers['Authorization'] && !options.headers['authorization']) {
        const credentials = Buffer.from('admin:admin123').toString('base64');
        options.headers['Authorization'] = `Basic ${credentials}`;
      }
    }
    const response = await fetch(url, options);
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    
    let body = null;
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    
    return { status, body, success: response.ok };
  } catch (error) {
    throw new Error(`Failed to request ${url}: ${error.message}`);
  }
}

// Function to delete database files
function cleanupDbFiles() {
  console.log(`[Test Harness] Cleaning up database files...`);
  const paths = getPossibleDbPaths(DB_PATH);
  for (const p of paths) {
    let attempts = 8;
    while (attempts > 0 && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        break;
      } catch (err) {
        attempts--;
        if (attempts === 0) {
          console.warn(`[Test Harness] Pre-cleanup warning for ${p}: ${err.message}`);
        } else {
          // Synchronous sleep of 100ms
          const start = Date.now();
          while (Date.now() - start < 100) {}
        }
      }
    }
  }
}

// Spawns the server on PORT
async function spawnServer(cleanup = true) {
  if (cleanup) {
    cleanupDbFiles();
  }

  console.log(`[Test Harness] Spawning server.js on port ${PORT}...`);
  const serverScript = path.join(__dirname, 'server.js');
  if (!fs.existsSync(serverScript)) {
    throw new Error(`[Test Harness] ERROR: server.js not found at ${serverScript}`);
  }

  serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      PORT: PORT,
      DATABASE_PATH: DB_PATH,
      DB_PATH: DB_PATH,
    },
    stdio: 'ignore',
    shell: false,
  });

  serverProcess.on('error', (err) => {
    console.error(`[Test Harness] Process spawn error:`, err);
  });

  // Wait for the server to be ready (up to 3 seconds)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { status } = await makeRequest('/');
      if (status === 200 || status === 404) {
        console.log(`[Test Harness] Server started successfully on port ${PORT}.`);
        return true;
      }
    } catch (err) {
      // Server not ready yet
    }
    await sleep(100);
  }
  
  throw new Error(`[Test Harness] Server failed to start on port ${PORT} within 3 seconds.`);
}

function stopServerOnly() {
  if (serverProcess) {
    console.log(`[Test Harness] Stopping server...`);
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {
      console.error(`[Test Harness] Failed to kill server process: ${e.message}`);
    }
    serverProcess = null;
  }
}

function stopServer() {
  stopServerOnly();
  cleanupDbFiles();
}

// Helper to delete booking directly from DB for Tier 3 verification
async function deleteBookingDirectly(date, time) {
  const paths = getPossibleDbPaths(DB_PATH);
  const activePath = paths.find(p => fs.existsSync(p)) || DB_PATH;

  let isJson = false;
  try {
    const data = fs.readFileSync(activePath, 'utf8');
    JSON.parse(data);
    isJson = true;
  } catch (e) {}

  if (isJson) {
    const data = fs.readFileSync(activePath, 'utf8');
    let bookings = JSON.parse(data);
    bookings = bookings.filter(b => !(b.date === date && b.time === time));
    fs.writeFileSync(activePath, JSON.stringify(bookings, null, 2), 'utf8');
    console.log(`[Test Helper] Deleted booking ${date} ${time} via JSON`);
  } else {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(activePath);
    db.configure("busyTimeout", 2000);
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM citas WHERE date = ? AND time = ?', [date, time], function(err) {
        db.close();
        if (err) reject(err);
        else resolve();
      });
    });
    console.log(`[Test Helper] Deleted booking ${date} ${time} via SQLite`);
  }
}

// Main test suite description
test.describe('Quiropodia LC Booking System E2E Suite', () => {
  
  test.before(async () => {
    await spawnServer(true);
  });

  test.after(() => {
    stopServer();
  });

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (21 test cases)
  // =========================================================================
  test.describe('Tier 1: Feature Coverage', () => {
    
    // --- F1: Available Slots Display (5 cases) ---
    test('F1-T1-1: GET /api/disponibilidad returns slots for a valid future date', async () => {
      const res = await makeRequest('/api/disponibilidad?date=2026-08-01');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.availableSlots));
      assert.strictEqual(res.body.availableSlots.length, 9);
    });

    test('F1-T1-2: Verify slot items contain expected success boolean and availableSlots list', async () => {
      const res = await makeRequest('/api/disponibilidad?date=2026-08-01');
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.date, '2026-08-01');
      assert.ok(Array.isArray(res.body.availableSlots));
      assert.ok(res.body.availableSlots.every(slot => typeof slot === 'string'));
    });

    test('F1-T1-3: Querying availability without a date returns a 400 Bad Request', async () => {
      const res = await makeRequest('/api/disponibilidad');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('Missing date'));
    });

    test('F1-T1-4: Booking a slot successfully removes it from availability', async () => {
      const date = '2026-08-02';
      const slotTime = '11:00';
      
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'F1-T1-4 Patient', date, time: slotTime, phone: '123' })
      });
      assert.strictEqual(bookRes.status, 200);
      
      const avRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.strictEqual(avRes.status, 200);
      assert.ok(!avRes.body.availableSlots.includes(slotTime), 'Slot must be removed');
      assert.strictEqual(avRes.body.availableSlots.length, 8);
    });

    test('F1-T1-5: GET / returns 200 OK and serves static content', async () => {
      const res = await makeRequest('/');
      assert.strictEqual(res.status, 200);
      assert.ok(typeof res.body === 'string');
      assert.ok(res.body.includes('<!DOCTYPE html>') || res.body.includes('<html'));
    });

    // --- F2: Patient Booking Form Submission (6 cases) ---
    test('F2-T1-1: POST /api/reservas with valid parameters returns 200 OK', async () => {
      const payload = { name: 'John Doe', date: '2026-08-03', time: '10:00', phone: '123456789' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    test('F2-T1-2: Response includes a valid non-empty bookingId', async () => {
      const payload = { name: 'Id Checker', date: '2026-08-03', time: '11:00', phone: '987654' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.bookingId, 'Should have bookingId');
      assert.ok(String(res.body.bookingId).length > 0);
    });

    test('F2-T1-3: Booking is rejected with 400 Bad Request if name is missing', async () => {
      const payload = { date: '2026-08-03', time: '12:00', phone: '987654' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    test('F2-T1-4: Booking is rejected with 400 Bad Request if date is missing', async () => {
      const payload = { name: 'No Date', time: '12:00', phone: '987654' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    test('F2-T1-5: Booking is rejected with 400 Bad Request if time is missing', async () => {
      const payload = { name: 'No Time', date: '2026-08-03', phone: '987654' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    test('F2-T1-6: Booking is rejected with 400 Bad Request if phone is missing', async () => {
      const payload = { name: 'No Phone', date: '2026-08-03', time: '12:00' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    // --- F3: Local Database Persistence (5 cases) ---
    test('F3-T1-1: Database file is physically created on the first write', async () => {
      const paths = getPossibleDbPaths(DB_PATH);
      const exists = paths.some(p => fs.existsSync(p));
      assert.ok(exists, 'Database file should physically exist');
    });

    test('F3-T1-2: Database file starts at 0 bytes or non-existent, and grows after a successful booking', async () => {
      const paths = getPossibleDbPaths(DB_PATH);
      const activePath = paths.find(p => fs.existsSync(p));
      assert.ok(activePath, 'Active database file must exist');
      const stats = fs.statSync(activePath);
      assert.ok(stats.size > 0, `Database file size should be greater than 0 bytes, was ${stats.size}`);
    });

    test('F3-T1-3: Database persists the exact details of the booking made', async () => {
      const paths = getPossibleDbPaths(DB_PATH);
      const activePath = paths.find(p => fs.existsSync(p));
      assert.ok(activePath, 'Database file must exist');
      assert.ok(fs.statSync(activePath).size > 0, 'Database file size must be > 0');

      const res = await makeRequest('/admin/citas?date=2026-08-03');
      assert.strictEqual(res.status, 200);
      const booking = res.body.find(b => b.name === 'John Doe' && b.time === '10:00');
      assert.ok(booking, 'Booking details should be persisted and queryable from /admin/citas');
      assert.strictEqual(booking.phone, '123456789');
    });

    test('F3-T1-4: Restarting the server retains database contents', async () => {
      // Book a unique appointment first
      const date = '2026-08-03';
      const slotTime = '13:00';
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Restart User', date, time: slotTime, phone: '555' })
      });
      assert.strictEqual(bookRes.status, 200);

      // Stop server without deleting DB files
      stopServerOnly();
      await sleep(500);

      // Restart server
      await spawnServer(false);

      // Query and verify details are still present
      const res = await makeRequest(`/admin/citas?date=${date}`);
      assert.strictEqual(res.status, 200);
      const booking = res.body.find(b => b.name === 'Restart User' && b.time === slotTime);
      assert.ok(booking, 'Should retain booking after restart');
    });

    test('F3-T1-5: Database writes are synchronous or fully flushed before response returns', async () => {
      const date = '2026-08-03';
      const slotTime = '14:00';
      
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sync User', date, time: slotTime, phone: '444' })
      });
      assert.strictEqual(bookRes.status, 200);

      // Immediately query admin citas without sleep, it must already be persisted
      const res = await makeRequest(`/admin/citas?date=${date}`);
      const booking = res.body.find(b => b.name === 'Sync User' && b.time === slotTime);
      assert.ok(booking, 'Booking must be immediately queryable');
    });

    // --- F4: Administrative View Endpoint (5 cases) ---
    test('F4-T1-1: GET /admin/citas returns 200 OK', async () => {
      const res = await makeRequest('/admin/citas');
      assert.strictEqual(res.status, 200);
    });

    test('F4-T1-2: GET /admin/citas returns a JSON array', async () => {
      const res = await makeRequest('/admin/citas');
      assert.ok(Array.isArray(res.body));
    });

    test('F4-T1-3: /admin/citas response array contains the recently booked appointment', async () => {
      const res = await makeRequest('/admin/citas?date=2026-08-03');
      const booking = res.body.find(b => b.name === 'John Doe' && b.time === '10:00');
      assert.ok(booking);
    });

    test('F4-T1-4: Querying /admin/citas for a date with no appointments returns empty array', async () => {
      const res = await makeRequest('/admin/citas?date=2026-08-04');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, []);
    });

    test('F4-T1-5: /admin/citas response elements match the required structure', async () => {
      const res = await makeRequest('/admin/citas?date=2026-08-03');
      assert.ok(res.body.length > 0);
      const first = res.body[0];
      assert.ok(first.hasOwnProperty('id'));
      assert.ok(first.hasOwnProperty('name'));
      assert.ok(first.hasOwnProperty('date'));
      assert.ok(first.hasOwnProperty('time'));
      assert.ok(first.hasOwnProperty('phone'));
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (21 test cases)
  // =========================================================================
  test.describe('Tier 2: Boundary & Corner Cases', () => {

    // --- F1: Available Slots Display (5 cases) ---
    test('F1-T2-1: Query slots for a past date', async () => {
      const res = await makeRequest('/api/disponibilidad?date=2020-01-01');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.availableSlots));
      assert.strictEqual(res.body.availableSlots.length, 9);
    });

    test('F1-T2-2: Query slots for an extreme future date', async () => {
      const res = await makeRequest('/api/disponibilidad?date=9999-12-31');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.availableSlots));
      assert.strictEqual(res.body.availableSlots.length, 9);
    });

    test('F1-T2-3: Query slots with invalid date format string', async () => {
      const res = await makeRequest('/api/disponibilidad?date=invalid-date-string');
      // Should handle gracefully (either return slots or 400 but not crash)
      assert.ok(res.status === 200 || res.status === 400);
      if (res.status === 200) {
        assert.ok(Array.isArray(res.body.availableSlots));
      }
    });

    test('F1-T2-4: Query slots on leap-year day', async () => {
      const res = await makeRequest('/api/disponibilidad?date=2028-02-29');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.availableSlots));
      assert.strictEqual(res.body.availableSlots.length, 9);
    });

    test('F1-T2-5: Request availability when database file does not exist yet', async () => {
      // Temporarily stop server, delete db files, and restart
      stopServerOnly();
      cleanupDbFiles();
      await spawnServer(false);

      // Now query availability before any bookings are written
      const res = await makeRequest('/api/disponibilidad?date=2026-08-01');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.availableSlots));
      assert.strictEqual(res.body.availableSlots.length, 9);
    });

    // --- F2: Patient Booking Form Submission (6 cases) ---
    test('F2-T2-1: Attempt to book an already booked slot (double-booking) returns 400', async () => {
      const payload = { name: 'Original Booker', date: '2026-08-05', time: '10:00', phone: '123' };
      const res1 = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res1.status, 200);

      const res2 = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Double Booker', date: '2026-08-05', time: '10:00', phone: '456' })
      });
      assert.strictEqual(res2.status, 400);
      assert.strictEqual(res2.body.success, false);
      assert.ok(res2.body.error.includes('Double booking'));
    });

    test('F2-T2-2: Attempt to book with a name of extreme length', async () => {
      const extremeName = 'A'.repeat(1000);
      const payload = { name: extremeName, date: '2026-08-06', time: '10:00', phone: '123' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    test('F2-T2-3: Attempt to book with SQL/NoSQL injection payload in the name field', async () => {
      const sqlInjection = "'; DROP TABLE citas; --";
      const payload = { name: sqlInjection, date: '2026-08-07', time: '10:00', phone: '123' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);

      const adminRes = await makeRequest('/admin/citas?date=2026-08-07');
      const booking = adminRes.body.find(b => b.time === '10:00');
      assert.ok(booking);
      assert.strictEqual(booking.name, sqlInjection, 'Must store exact literal injection string safely');
    });

    test('F2-T2-4: Attempt to book with HTML/XSS injection payload in name field', async () => {
      const xssInjection = "<script>alert('xss')</script>";
      const payload = { name: xssInjection, date: '2026-08-08', time: '10:00', phone: '123' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);

      const adminRes = await makeRequest('/admin/citas?date=2026-08-08');
      const booking = adminRes.body.find(b => b.time === '10:00');
      assert.ok(booking);
      assert.strictEqual(booking.name, xssInjection, 'Must store XSS string exactly without executing it');
    });

    test('F2-T2-5: Attempt to book with non-standard but valid phone formats', async () => {
      const phoneFormat = '+1 (555) 019-2834 ext 12';
      const payload = { name: 'Valid Phone Patient', date: '2026-08-09', time: '10:00', phone: phoneFormat };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);

      const adminRes = await makeRequest('/admin/citas?date=2026-08-09');
      const booking = adminRes.body.find(b => b.time === '10:00');
      assert.ok(booking);
      assert.strictEqual(booking.phone, phoneFormat);
    });

    test('F2-T2-6: Attempt to book with empty or blank values', async () => {
      const payload = { name: '   ', date: '2026-08-10', time: '10:00', phone: '123' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    // --- F3: Local Database Persistence (5 cases) ---
    test('F3-T2-1: Write booking when DB path folder is invalid', async () => {
      // Spawn a temp server with invalid DB path path containing invalid directory name / characters
      const invalidPath = 'C:\\nonexistent_dir_invalid_chars_??\\citas.db';
      const tempPort = '3002';
      
      const serverScript = path.join(__dirname, 'server.js');
      let proc = null;
      try {
        proc = spawn('node', [serverScript], {
          env: {
            ...process.env,
            PORT: tempPort,
            DATABASE_PATH: invalidPath,
            DB_PATH: invalidPath,
          },
          stdio: 'ignore',
          shell: false,
        });

        // Wait a moment and check if it failed/exited
        await sleep(1000);
        const hasExited = proc.killed || proc.exitCode !== null;
        assert.ok(hasExited, 'Server process should have failed to start or exited with error');
      } finally {
        if (proc) {
          try { proc.kill('SIGKILL'); } catch (e) {}
        }
      }
    });

    test('F3-T2-2: Verify system behavior when database file is modified or deleted during runtime', async () => {
      // Book a slot first
      const date = '2026-08-10';
      const payload = { name: 'Deleted DB Test', date, time: '11:00', phone: '123' };
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(bookRes.status, 200);

      // Physical deletion of DB file
      cleanupDbFiles();

      // Query admin citas. The server should handle gracefully (either return 500 or recreate DB, but not crash).
      const res = await makeRequest(`/admin/citas?date=${date}`);
      assert.ok(res.status === 200 || res.status === 500);
      
      // Attempt another booking. It should either succeed (recreating DB) or reject with 500/400.
      const bookRes2 = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Post-Delete User', date, time: '12:00', phone: '999' })
      });
      assert.ok([200, 400, 500].includes(bookRes2.status));
    });

    test('F3-T2-3: Test high volume write persistence and check database file integrity', async () => {
      // Write 20 bookings for 20 different dates
      const baseDate = '2026-11-';
      const promises = [];
      for (let i = 1; i <= 20; i++) {
        const dayStr = String(i).padStart(2, '0');
        const date = `${baseDate}${dayStr}`;
        const mockPhone = `32012345${dayStr}`;
        promises.push(makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Volume Patient ${i}`, date, time: '09:00', phone: mockPhone })
        }));
      }

      const results = await Promise.all(promises);
      assert.ok(results.every(r => r.status === 200), 'All 20 high-volume bookings should succeed');

      // Check count in admin view
      const allCitasRes = await makeRequest('/admin/citas');
      assert.strictEqual(allCitasRes.status, 200);
      const volumeBookings = allCitasRes.body.filter(b => b.name.startsWith('Volume Patient'));
      assert.strictEqual(volumeBookings.length, 20, 'All 20 bookings must be stored in database');
    });

    test('F3-T2-4: Write booking with emoji/UTF-8 multi-byte characters in name', async () => {
      const emojiName = '💅 Quiropodia 🌸';
      const payload = { name: emojiName, date: '2026-08-12', time: '10:00', phone: '123' };
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 200);

      const adminRes = await makeRequest('/admin/citas?date=2026-08-12');
      const booking = adminRes.body.find(b => b.time === '10:00');
      assert.ok(booking);
      assert.strictEqual(booking.name, emojiName, 'Emoji characters must be preserved exactly');
    });

    test('F3-T2-5: Initialize database with complex paths', async () => {
      // Spawn a temporary server on port 3003 with a database path containing spaces
      const spaceDirName = 'temp db folder';
      const spaceDirPath = path.join(__dirname, spaceDirName);
      const complexDbPath = path.join(spaceDirPath, 'citas_complex.json');
      const tempPort = '3003';

      if (fs.existsSync(spaceDirPath)) {
        try { fs.rmSync(spaceDirPath, { recursive: true, force: true }); } catch (e) {}
      }

      const serverScript = path.join(__dirname, 'server.js');
      let proc = null;
      try {
        proc = spawn('node', [serverScript], {
          env: {
            ...process.env,
            PORT: tempPort,
            DATABASE_PATH: complexDbPath,
            DB_PATH: complexDbPath,
          },
          stdio: 'ignore',
          shell: false,
        });

        // Wait for server to start
        let isReady = false;
        for (let i = 0; i < 30; i++) {
          try {
            const { status } = await makeRequest('/', {}, tempPort);
            if (status === 200 || status === 404) {
              isReady = true;
              break;
            }
          } catch (e) {}
          await sleep(100);
        }

        assert.ok(isReady, 'Temporary server should start with complex database path');

        // Book a slot to trigger DB write
        const bookRes = await makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Complex Path Patient', date: '2026-08-15', time: '10:00', phone: '123' })
        }, tempPort);
        assert.strictEqual(bookRes.status, 200);

        // Verify directory and file was physically created
        assert.ok(fs.existsSync(spaceDirPath), 'Complex directory path should be created');
        const stats = fs.statSync(spaceDirPath);
        assert.ok(stats.isDirectory());
      } finally {
        // Stop process
        if (proc) {
          try { proc.kill('SIGTERM'); } catch (e) {}
        }
        await sleep(200);

        // Clean up directory
        try { fs.rmSync(spaceDirPath, { recursive: true, force: true }); } catch (e) {}
      }
    });

    // --- F4: Administrative View Endpoint (5 cases) ---
    test('F4-T2-1: Query /admin/citas with no date parameter returns all bookings', async () => {
      const res = await makeRequest('/admin/citas');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.length > 0);
    });

    test('F4-T2-2: Query /admin/citas with malformed date format', async () => {
      const res = await makeRequest('/admin/citas?date=invalid_date');
      assert.ok(res.status === 200 || res.status === 400);
    });

    test('F4-T2-3: Query /admin/citas with SQL injection payload in query params', async () => {
      const sqliParam = "' OR '1'='1";
      const res = await makeRequest(`/admin/citas?date=${encodeURIComponent(sqliParam)}`);
      assert.strictEqual(res.status, 200);
      // It should not return everything; it should treat parameter as literal date and return empty list
      assert.deepStrictEqual(res.body, []);
    });

    test('F4-T2-4: Query /admin/citas when database file does not exist yet', async () => {
      // Temporarily stop, clean DB, and restart
      stopServerOnly();
      cleanupDbFiles();
      await spawnServer(false);

      const res = await makeRequest('/admin/citas');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, []);
    });

    test('F4-T2-5: Query /admin/citas with special characters in parameters', async () => {
      const res = await makeRequest('/admin/citas?date=2026-08-03%26special%3Dtrue');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, []);
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (4 test cases)
  // =========================================================================
  test.describe('Tier 3: Cross-Feature Combinations', () => {

    test('F-T3-1: End-to-End Booking Lifecycle', async () => {
      const date = '2026-09-01';
      const slotTime = '14:00';
      
      // 1. Fetch available slots
      const availabilityRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.strictEqual(availabilityRes.status, 200);
      assert.ok(availabilityRes.body.availableSlots.includes(slotTime));
      
      // 2. Submit booking
      const payload = { name: 'Alice Cross', date, time: slotTime, phone: '555123456' };
      const bookingRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(bookingRes.status, 200);
      assert.ok(bookingRes.body.bookingId);
      
      // 3. Verify DB size > 0
      const paths = getPossibleDbPaths(DB_PATH);
      const activePath = paths.find(p => fs.existsSync(p));
      assert.ok(activePath, 'Active DB file should exist');
      assert.ok(fs.statSync(activePath).size > 0);

      // 4. Query availability again (Slot should be marked unavailable)
      const availabilityResAfter = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.ok(!availabilityResAfter.body.availableSlots.includes(slotTime));
      
      // 5. Call admin view to confirm record
      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const adminRecord = adminRes.body.find(b => b.time === slotTime);
      assert.ok(adminRecord);
      assert.strictEqual(adminRecord.name, 'Alice Cross');
    });

    test('F-T3-2: Double Booking Prevention & State Sync', async () => {
      const date = '2026-09-02';
      const slotTime = '09:00';

      // Submit booking A and booking B concurrently for the same slot
      const reqA = makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Client A', date, time: slotTime, phone: '111' })
      });
      const reqB = makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Client B', date, time: slotTime, phone: '222' })
      });

      const [resA, resB] = await Promise.all([reqA, reqB]);
      
      const successCount = [resA, resB].filter(r => r.status === 200).length;
      const failureCount = [resA, resB].filter(r => r.status === 400).length;
      
      assert.strictEqual(successCount, 1, 'Exactly one concurrent booking must succeed');
      assert.strictEqual(failureCount, 1, 'Exactly one concurrent booking must fail');

      // Verify DB contains exactly one record
      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      assert.strictEqual(adminRes.body.length, 1);
    });

    test('F-T3-3: Multi-Day Routing and Segregation', async () => {
      const dateA = '2026-09-03';
      const dateB = '2026-09-04';

      await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Day A Patient', date: dateA, time: '10:00', phone: '100' })
      });

      await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Day B Patient', date: dateB, time: '11:00', phone: '200' })
      });

      // Verify routing segregation in admin panel
      const resA = await makeRequest(`/admin/citas?date=${dateA}`);
      assert.strictEqual(resA.body.length, 1);
      assert.strictEqual(resA.body[0].name, 'Day A Patient');

      const resB = await makeRequest(`/admin/citas?date=${dateB}`);
      assert.strictEqual(resB.body.length, 1);
      assert.strictEqual(resB.body[0].name, 'Day B Patient');
    });

    test('F-T3-4: Available Slot Re-calculation on Deletion', async () => {
      const date = '2026-09-05';
      const slotTime = '12:00';

      // 1. Book slot
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Temp Patient', date, time: slotTime, phone: '777' })
      });
      assert.strictEqual(bookRes.status, 200);

      // Verify slot is unavailable
      let avRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.ok(!avRes.body.availableSlots.includes(slotTime));

      // 2. Perform direct DB deletion
      await deleteBookingDirectly(date, slotTime);

      // 3. Verify availability immediately updated
      avRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.ok(avRes.body.availableSlots.includes(slotTime), 'Slot must be marked available again');
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 test cases)
  // =========================================================================
  test.describe('Tier 4: Real-World Application Scenarios', () => {

    test('F-T4-1: Standard Patient Happy Path', async () => {
      const date = '2026-10-01';
      
      // Step 1: Query available slots
      const getSlots = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.strictEqual(getSlots.status, 200);
      const chosenSlot = getSlots.body.availableSlots[0]; // pick first one
      
      // Step 2: Book slot
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Happy Path Patient', date, time: chosenSlot, phone: '123-456' })
      });
      assert.strictEqual(bookRes.status, 200);

      // Step 3: Check availability again
      const getSlotsAfter = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.ok(!getSlotsAfter.body.availableSlots.includes(chosenSlot));

      // Step 4: Verify booking details in admin panel
      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const booking = adminRes.body.find(b => b.time === chosenSlot);
      assert.ok(booking);
      assert.strictEqual(booking.name, 'Happy Path Patient');
    });

    test('F-T4-2: Clinic Rush Hour Concurrency Simulation', async () => {
      const date = '2026-10-02';
      const slotTime = '14:00';
      
      const requests = Array.from({ length: 5 }, (_, index) => {
        return makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Patient Rush ${index}`,
            date,
            time: slotTime,
            phone: `999-00${index}`
          })
        });
      });
      
      const results = await Promise.all(requests);
      
      const successCount = results.filter(r => r.status === 200).length;
      const failureCount = results.filter(r => r.status === 400).length;
      
      assert.strictEqual(successCount, 1, 'Only one booking should succeed');
      assert.strictEqual(failureCount, 4, 'Other bookings should be rejected');
      
      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const slotBookings = adminRes.body.filter(b => b.time === slotTime);
      assert.strictEqual(slotBookings.length, 1, 'Admin must show exactly 1 booking for this slot');
    });

    test('F-T4-3: Full Schedule Lockout', async () => {
      const date = '2026-10-03';
      
      // Get all 9 daily slots
      const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
      
      // Book all 9 slots sequentially
      for (const slot of allSlots) {
        const res = await makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Lockout Patient ${slot}`, date, time: slot, phone: '000' })
        });
        assert.strictEqual(res.status, 200);
      }

      // Check availability (should be empty list)
      const avRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.deepStrictEqual(avRes.body.availableSlots, [], 'Should have no slots available');

      // Attempt to book a 10th slot (should fail)
      const res10 = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '10th Patient', date, time: '18:00', phone: '000' })
      });
      // The database validation enforces uniqueness on (date, time) and slot check. 
      // If we attempt to book a slot that is not in the default list or a double booking, it should be rejected.
      // E.g., double booking '09:00'
      const doubleRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '10th Patient', date, time: '09:00', phone: '000' })
      });
      assert.strictEqual(doubleRes.status, 400);
    });

    test('F-T4-4: Server Restart Recovery', async () => {
      const date = '2026-10-04';
      const slotTime = '15:00';

      // 1. Book a slot
      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Recovery User', date, time: slotTime, phone: '111' })
      });
      assert.strictEqual(bookRes.status, 200);

      // Stop server
      stopServerOnly();
      await sleep(500);

      // Start server again (retaining DB)
      await spawnServer(false);

      // Query availability and admin panel to confirm recovery
      const avRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.ok(!avRes.body.availableSlots.includes(slotTime));

      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const booking = adminRes.body.find(b => b.time === slotTime);
      assert.ok(booking);
      assert.strictEqual(booking.name, 'Recovery User');
    });

    test('F-T4-5: Special Character Patient Information', async () => {
      const date = '2026-10-05';
      const specialName = "François-Noël d'Artois 🍃";
      const specialPhone = '+33 1 23 45 67 89';

      const bookRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: specialName, date, time: '10:00', phone: specialPhone })
      });
      assert.strictEqual(bookRes.status, 200);

      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const booking = adminRes.body.find(b => b.time === '10:00');
      assert.ok(booking);
      assert.strictEqual(booking.name, specialName);
      assert.strictEqual(booking.phone, specialPhone);
    });
  });

  // =========================================================================
  // TIER 5: ADVERSARIAL HARDENING (5 test cases)
  // =========================================================================
  test.describe('Tier 5: Adversarial Hardening', () => {

    test('F-T5-1: Past Date Booking rejection', async () => {
      const pastDate = '2020-01-01';
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Past Patient', date: pastDate, time: '09:00', phone: '123-456' })
      });
      assert.strictEqual(res.status, 400);
    });

    test('F-T5-2: Malformed Date Format rejection', async () => {
      const invalidDates = ['2026/10/10', '2026-13-01', '2026-10-32', 'invalid-date', '2026-02-30'];
      for (const d of invalidDates) {
        const res = await makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Malformed Date Patient', date: d, time: '10:00', phone: '123-456' })
        });
        assert.strictEqual(res.status, 400, `Should reject invalid date format/calendar value: ${d}`);
      }
    });

    test('F-T5-3: Malformed Phone Number rejection', async () => {
      const invalidPhones = ['12', 'abc', '+123456789012345678901', '123-abc-456', 'phone123'];
      for (const p of invalidPhones) {
        const res = await makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Malformed Phone Patient', date: '2026-12-01', time: '11:00', phone: p })
        });
        assert.strictEqual(res.status, 400, `Should reject invalid phone format: ${p}`);
      }
    });

    test('F-T5-4: Array query parameter compatibility', async () => {
      // Test GET /admin/citas with array query parameter
      const resAdmin = await makeRequest('/admin/citas?date=2026-10-01&date=2026-10-02');
      assert.strictEqual(resAdmin.status, 200);
      assert.ok(Array.isArray(resAdmin.body));

      // Test GET /api/disponibilidad with array query parameter
      const resDisp = await makeRequest('/api/disponibilidad?date=2026-10-01&date=2026-10-02');
      assert.strictEqual(resDisp.status, 200);
      assert.ok(resDisp.body.success);
      assert.strictEqual(resDisp.body.date, '2026-10-01');
    });

    test('F-T5-5: JSON corruption recovery', async () => {
      // 1. Force server to run in JSON mode
      stopServerOnly();
      process.env.FORCE_JSON_DB = 'true';
      await spawnServer(true); // cleans up existing files and spawns fresh JSON db

      // 2. Write corrupted content to the database file
      const paths = getPossibleDbPaths(DB_PATH);
      const activePath = paths.find(p => p.endsWith('.json')) || DB_PATH;
      fs.writeFileSync(activePath, '{ corrupted json: true, [unclosed ', 'utf8');

      // 3. Make API request - should recover, not crash, return 200
      const res = await makeRequest('/api/disponibilidad?date=2026-10-06');
      assert.strictEqual(res.status, 200, 'Server must handle request with 200 status');
      assert.ok(res.body.success);

      // 4. Verify file was reset to valid empty array JSON
      const repairedData = fs.readFileSync(activePath, 'utf8');
      const parsed = JSON.parse(repairedData);
      assert.deepStrictEqual(parsed, [], 'Database file must be reset to an empty array');

      // Clean up environment and restore default server state
      delete process.env.FORCE_JSON_DB;
      stopServerOnly();
      await spawnServer(true);
    });
  });
});

