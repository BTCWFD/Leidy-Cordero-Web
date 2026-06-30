/**
 * test_booking.js
 * 
 * Automated E2E Verification Script for Quiropodia LC Booking System.
 * Designed to execute programmatic checks against public HTTP endpoints and verify
 * SQLite/JSON database persistence.
 * 
 * Run via: Node.js test runner
 * Command: node test_booking.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Test Environment Settings
const PORT = process.env.PORT || '3001';
const DB_PATH = process.env.DB_PATH || 'citas_test.json';
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;

// Helper to wait
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for making API requests using native fetch
async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  try {
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

// Lifecycle hook: Start server
async function startServer() {
  console.log(`[Test Harness] Cleaning up database file at ${DB_PATH} before start...`);
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  console.log(`[Test Harness] Spawning server.js on port ${PORT}...`);
  serverProcess = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      PORT: PORT,
      DB_PATH: DB_PATH,
    },
    stdio: 'ignore', // Keep output clean, or redirect to a log file if needed
    shell: true,
  });

  // Wait for the server to be ready (up to 3 seconds)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { status } = await makeRequest('/');
      if (status === 200) {
        console.log(`[Test Harness] Server started successfully on port ${PORT}.`);
        return;
      }
    } catch (err) {
      // Server not ready yet
    }
    await sleep(100);
  }
  
  throw new Error(`[Test Harness] Server failed to start on port ${PORT} within 3 seconds.`);
}

// Lifecycle hook: Stop server
function stopServer() {
  if (serverProcess) {
    console.log(`[Test Harness] Stopping server...`);
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  
  console.log(`[Test Harness] Cleaning up database file at ${DB_PATH}...`);
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
    } catch (err) {
      console.warn(`[Test Harness] Could not delete ${DB_PATH}: ${err.message}`);
    }
  }
}

// Main test wrapper
test.describe('Quiropodia LC Booking System E2E Suite', () => {
  
  test.before(async () => {
    await startServer();
  });

  test.after(() => {
    stopServer();
  });

  // ==========================================
  // TIER 1: FEATURE COVERAGE (Sample Tests)
  // ==========================================

  test.describe('Tier 1: Feature Coverage', () => {
    
    test('F1-T1-1: GET /api/slots (or availability endpoint) returns slots', async () => {
      // NOTE: Endpoint path will be aligned with the actual server.js implementation.
      // E.g. GET /api/disponibilidad?date=2026-07-01
      const res = await makeRequest('/api/disponibilidad?date=2026-07-01');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body), 'Response should be an array of slots');
      if (res.body.length > 0) {
        assert.ok('time' in res.body[0], 'Slot must have a time property');
        assert.ok('available' in res.body[0], 'Slot must have an available property');
      }
    });

    test('F2-T1-1: POST /api/reservas submits a valid booking successfully', async () => {
      const payload = {
        name: 'John Doe',
        date: '2026-07-01',
        time: '10:00',
        phone: '123456789'
      };
      
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.bookingId, 'Response must return a bookingId');
    });

    test('F3-T1-1: DB persistence checks file exists and size > 0', async () => {
      // Assert the DB file was created and is not empty
      const dbFileExists = fs.existsSync(DB_PATH);
      assert.ok(dbFileExists, `Database file at ${DB_PATH} should exist after booking`);
      
      const stats = fs.statSync(DB_PATH);
      assert.ok(stats.size > 0, `Database file size should be greater than 0 bytes, was ${stats.size}`);
    });

    test('F4-T1-1: GET /admin/citas returns booking details', async () => {
      const res = await makeRequest('/admin/citas?date=2026-07-01');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body), 'Admin citas endpoint must return an array');
      
      const booking = res.body.find(b => b.name === 'John Doe' && b.time === '10:00');
      assert.ok(booking, 'Created booking should be visible in admin list');
      assert.strictEqual(booking.phone, '123456789');
    });

    // Additional Tier 1 test placeholders (to reach >= 20 cases in M2)
    // F1-T1-2 through 5
    // F2-T1-2 through 6
    // F3-T1-2 through 5
    // F4-T1-2 through 5
  });

  // ==========================================
  // TIER 2: BOUNDARY & CORNER CASES (Sample)
  // ==========================================
  test.describe('Tier 2: Boundary & Corner Cases', () => {
    test('F2-T2-1: Double booking of same slot is rejected', async () => {
      const payload = {
        name: 'Jane Smith',
        date: '2026-07-01',
        time: '10:00', // Already booked by John Doe above
        phone: '987654321'
      };
      
      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      assert.strictEqual(res.status, 400, 'Double booking same slot should return 400 Bad Request');
      assert.strictEqual(res.body.success, false);
    });

    test('F2-T2-3: SQL injection safety in booking submission', async () => {
      const sqlInjectionPayload = {
        name: "'; DROP TABLE citas; --",
        date: '2026-07-01',
        time: '11:00',
        phone: '123456789'
      };

      const res = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sqlInjectionPayload)
      });
      
      // Should succeed to save it as literal text, NOT execute it
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify the literal name is stored in DB/admin view
      const adminRes = await makeRequest('/admin/citas?date=2026-07-01');
      const savedBooking = adminRes.body.find(b => b.time === '11:00');
      assert.ok(savedBooking);
      assert.strictEqual(savedBooking.name, "'; DROP TABLE citas; --", 'Name must be stored exactly as input');
    });

    // Additional Tier 2 test placeholders (to reach >= 20 cases in M2)
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================
  test.describe('Tier 3: Cross-Feature Combinations', () => {
    test('F-T3-1: End-to-End Booking Lifecycle', async () => {
      // 1. Fetch available slots for a new day
      const date = '2026-07-02';
      const slotTime = '14:00';
      
      const availabilityRes = await makeRequest(`/api/disponibilidad?date=${date}`);
      assert.strictEqual(availabilityRes.status, 200);
      const targetSlotBefore = availabilityRes.body.find(s => s.time === slotTime);
      assert.ok(targetSlotBefore, 'Slot 14:00 should be present in raw response');
      assert.strictEqual(targetSlotBefore.available, true, 'Slot should be available initially');
      
      // 2. Submit booking for that slot
      const bookingPayload = {
        name: 'Alice Cross',
        date,
        time: slotTime,
        phone: '555123456'
      };
      const bookingRes = await makeRequest('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload)
      });
      assert.strictEqual(bookingRes.status, 200);
      
      // 3. Verify availability updated
      const availabilityResAfter = await makeRequest(`/api/disponibilidad?date=${date}`);
      const targetSlotAfter = availabilityResAfter.body.find(s => s.time === slotTime);
      assert.ok(!targetSlotAfter || targetSlotAfter.available === false, 'Slot should now be unavailable or omitted');
      
      // 4. Verify in Admin view
      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const adminRecord = adminRes.body.find(b => b.time === slotTime);
      assert.ok(adminRecord, 'Booking must show up in admin view');
      assert.strictEqual(adminRecord.name, 'Alice Cross');
    });

    // Additional Tier 3 test placeholders (to reach >= 4 cases in M3)
  });

  // ==========================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ==========================================
  test.describe('Tier 4: Real-World Application Scenarios', () => {
    test('F-T4-2: Clinic Rush Hour Concurrency Simulation', async () => {
      const date = '2026-07-03';
      const slotTime = '09:00';
      
      // Create 5 concurrent booking requests for the same slot
      const requests = Array.from({ length: 5 }, (_, index) => {
        return makeRequest('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Patient Rush ${index}`,
            date,
            time: slotTime,
            phone: `99900000${index}`
          })
        });
      });
      
      const results = await Promise.all(requests);
      
      // Exactly 1 should succeed, and the others must fail with 400 (or other error code)
      const successCount = results.filter(r => r.status === 200).length;
      const failureCount = results.filter(r => r.status === 400).length;
      
      assert.strictEqual(successCount, 1, 'Only one booking should succeed');
      assert.strictEqual(failureCount, 4, 'Other bookings should be rejected');
      
      // Verify DB / Admin view contains exactly 1 entry for this slot
      const adminRes = await makeRequest(`/admin/citas?date=${date}`);
      const slotBookings = adminRes.body.filter(b => b.time === slotTime);
      assert.strictEqual(slotBookings.length, 1, 'Admin view must list exactly one booking for this slot');
    });

    // Additional Tier 4 test placeholders (to reach >= 5 cases in M3)
  });
  
});
