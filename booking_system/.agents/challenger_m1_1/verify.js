/**
 * verify.js
 * 
 * Custom E2E verification script written by the challenger agent.
 * Verifies all 5 requirements:
 * 1. Server starts correctly
 * 2. Valid booking submission succeeds
 * 3. Double booking is blocked
 * 4. Database file is created and size > 0 bytes
 * 5. Appointments list at /admin/citas is correct
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TEST_PORT = '3005';
const TEST_DB_PATH = path.join(__dirname, 'test_database.sqlite');
const TEST_JSON_PATH = path.join(__dirname, 'test_database.json');
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to clean up database files
function cleanDbFiles() {
  [TEST_DB_PATH, TEST_JSON_PATH].forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`Cleaned up file: ${file}`);
      } catch (err) {
        console.warn(`Failed to delete ${file}: ${err.message}`);
      }
    }
  });
}

async function runVerification() {
  console.log('=== STARTING BACKEND SCAFFOLDING VERIFICATION ===');
  
  // Pre-cleanup
  cleanDbFiles();
  
  // Start server as background process
  const serverScript = path.join(__dirname, '..', '..', 'server.js');
  console.log(`Starting server from: ${serverScript} on port ${TEST_PORT}`);
  
  const serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      PORT: TEST_PORT,
      DATABASE_PATH: TEST_DB_PATH,
      DB_PATH: TEST_DB_PATH // For compatibility
    },
    stdio: 'pipe'
  });

  let serverOutput = '';
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data.toString()}`);
  });

  let started = false;
  // Wait up to 5 seconds for startup
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/disponibilidad?date=2026-07-01`);
      if (res.ok) {
        started = true;
        break;
      }
    } catch (e) {
      // not ready yet
    }
    await sleep(100);
  }

  if (!started) {
    console.error('Server failed to start within 5 seconds.');
    console.error('Server stdout:', serverOutput);
    serverProcess.kill();
    process.exit(1);
  }
  console.log('Requirement 1 PASS: Server started correctly.');

  try {
    // 2. Submit valid booking
    console.log('Submitting valid booking...');
    const bookingPayload = {
      name: 'Test Patient',
      date: '2026-07-01',
      time: '12:00',
      phone: '555-0199'
    };

    const resBooking = await fetch(`${BASE_URL}/api/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload)
    });

    assert.strictEqual(resBooking.status, 200, 'Booking response status should be 200');
    const bookingResult = await resBooking.json();
    assert.strictEqual(bookingResult.success, true, 'Booking result success should be true');
    assert.ok(bookingResult.bookingId, 'Booking response should include bookingId');
    console.log(`Requirement 2 PASS: Valid booking submitted successfully. ID: ${bookingResult.bookingId}`);

    // 3. Double booking blocked
    console.log('Attempting double booking (same date/time)...');
    const doubleBookingPayload = {
      name: 'Another Patient',
      date: '2026-07-01',
      time: '12:00', // Conflict
      phone: '555-0200'
    };

    const resDoubleBooking = await fetch(`${BASE_URL}/api/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doubleBookingPayload)
    });

    assert.strictEqual(resDoubleBooking.status, 400, 'Double booking response status should be 400');
    const doubleBookingResult = await resDoubleBooking.json();
    assert.strictEqual(doubleBookingResult.success, false, 'Double booking success should be false');
    assert.ok(doubleBookingResult.error.includes('Double booking'), 'Error message should indicate double booking');
    console.log('Requirement 3 PASS: Double booking blocked as expected.');

    // 4. Database file verification
    console.log('Checking database file creation and size...');
    await sleep(200); // Wait for potential async filesystem flush

    const sqliteExists = fs.existsSync(TEST_DB_PATH);
    const jsonExists = fs.existsSync(TEST_JSON_PATH);
    
    assert.ok(sqliteExists || jsonExists, 'Either SQLite or JSON database file must exist');
    const activePath = sqliteExists ? TEST_DB_PATH : TEST_JSON_PATH;
    const stats = fs.statSync(activePath);
    assert.ok(stats.size > 0, `Database file size should be > 0 bytes, actual: ${stats.size} bytes`);
    console.log(`Requirement 4 PASS: Database file created at ${activePath} (${stats.size} bytes).`);

    // 5. Appointments listed correctly at /admin/citas
    console.log('Fetching appointments from /admin/citas...');
    const resCitas = await fetch(`${BASE_URL}/admin/citas?date=2026-07-01`);
    assert.strictEqual(resCitas.status, 200, 'Admin citas status should be 200');
    const citas = await resCitas.json();
    
    assert.ok(Array.isArray(citas), '/admin/citas response should be an array');
    const found = citas.find(c => c.name === 'Test Patient' && c.time === '12:00');
    assert.ok(found, 'Submitted booking should be present in admin list');
    assert.strictEqual(found.phone, '555-0199', 'Patient phone number should match');
    console.log('Requirement 5 PASS: Appointments are listed correctly.');

    console.log('=== ALL VERIFICATIONS PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('VERIFICATION FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    console.log('Stopping server...');
    serverProcess.kill();
    cleanDbFiles();
  }
}

runVerification();
