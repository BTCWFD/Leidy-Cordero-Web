/**
 * test_challenges.js
 * Challenges the edge cases of validations and DB corruption recovery.
 */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('path');

const PORT = '3005';
const DB_PATH = 'citas_challenge.json';
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function cleanupDbFiles() {
  if (fs.existsSync(DB_PATH)) {
    try { fs.unlinkSync(DB_PATH); } catch (e) {}
  }
}

async function spawnServer() {
  cleanupDbFiles();
  const serverScript = path.join(__dirname, 'server.js');
  
  serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      PORT: PORT,
      DATABASE_PATH: DB_PATH,
      DB_PATH: DB_PATH,
      FORCE_JSON_DB: 'true' // Test corruption on JSON db mode
    },
    stdio: 'ignore',
    shell: false,
  });

  // Wait up to 3 seconds
  for (let i = 0; i < 30; i++) {
    try {
      const { status } = await makeRequest('/');
      if (status === 200 || status === 404) {
        return true;
      }
    } catch (e) {}
    await sleep(100);
  }
  throw new Error('Server failed to start on port ' + PORT);
}

function stopServer() {
  if (serverProcess) {
    try { serverProcess.kill('SIGKILL'); } catch (e) {}
    serverProcess = null;
  }
  cleanupDbFiles();
}

async function runTests() {
  console.log('--- STARTING CHALLENGE TESTS ---');
  await spawnServer();

  try {
    // ----------------------------------------------------
    // TEST 1: Date Format Validation Edge Cases
    // ----------------------------------------------------
    console.log('Testing date validation...');
    
    // Future leap year (valid)
    let res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Leap Year Patient', date: '2028-02-29', time: '10:00', phone: '123456' })
    });
    assert.strictEqual(res.status, 200, '2028-02-29 should be accepted');

    // Future non-leap year Feb 29 (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Non Leap Year Patient', date: '2027-02-29', time: '11:00', phone: '123456' })
    });
    assert.strictEqual(res.status, 400, '2027-02-29 should be rejected');

    // Month boundary: month 13 (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Month 13 Patient', date: '2026-13-10', time: '11:00', phone: '123456' })
    });
    assert.strictEqual(res.status, 400, 'Month 13 should be rejected');

    // Day boundary: day 32 (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Day 32 Patient', date: '2026-05-32', time: '11:00', phone: '123456' })
    });
    assert.strictEqual(res.status, 400, 'Day 32 should be rejected');

    // Day boundary: day 00 (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Day 00 Patient', date: '2026-05-00', time: '11:00', phone: '123456' })
    });
    assert.strictEqual(res.status, 400, 'Day 00 should be rejected');

    // Past date (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Past Patient', date: '2020-01-01', time: '11:00', phone: '123456' })
    });
    assert.strictEqual(res.status, 400, 'Past date should be rejected');

    // ----------------------------------------------------
    // TEST 2: Phone Validation Edge Cases
    // ----------------------------------------------------
    console.log('Testing phone validation...');

    // Phone with too few digits (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Short Phone', date: '2026-08-01', time: '12:00', phone: '12' })
    });
    assert.strictEqual(res.status, 400, 'Phone length < 3 digits should be rejected');

    // Phone with no digits (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Digits Phone', date: '2026-08-01', time: '12:00', phone: '---' })
    });
    assert.strictEqual(res.status, 400, 'Phone with no digits should be rejected');

    // Phone with letters (invalid)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Letters Phone', date: '2026-08-01', time: '12:00', phone: '123-abc-456' })
    });
    assert.strictEqual(res.status, 400, 'Phone with letters should be rejected');

    // Phone with newlines (valid regex-wise but check if it crashes or gets rejected)
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Newline Phone', date: '2026-08-01', time: '12:00', phone: '123\n456' })
    });
    // In our regex /^\+?[0-9\s\-()]+(?:\s*(?:ext|x|ext\.)\s*[0-9]+)?$/i, \s matches \n.
    // If it is accepted (status 200), that is okay as it is valid per the regex.
    console.log(`Newline phone response status: ${res.status}`);

    // ----------------------------------------------------
    // TEST 3: JSON DB Corruption Recovery Cases
    // ----------------------------------------------------
    console.log('Testing DB corruption recovery...');

    const corruptStates = [
      { label: 'Primitive Null', content: 'null' },
      { label: 'Primitive Number', content: '12345' },
      { label: 'Primitive Boolean', content: 'true' },
      { label: 'Object (not array)', content: '{"citas": []}' },
      { label: 'Malformed JSON', content: '{"incomplete": ' },
      { label: 'Empty database file', content: '' }
    ];

    for (const state of corruptStates) {
      console.log(`  Testing corruption state: ${state.label}`);
      // Write corrupt content directly to DB file
      fs.writeFileSync(DB_PATH, state.content, 'utf8');

      // Make availability request
      const avRes = await makeRequest('/api/disponibilidad?date=2026-08-01');
      assert.strictEqual(avRes.status, 200, `${state.label}: Server should handle and return 200`);
      assert.strictEqual(avRes.body.success, true);
      assert.deepStrictEqual(avRes.body.availableSlots.length, 9);

      // Verify file was repaired back to an empty array
      const repaired = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      assert.deepStrictEqual(repaired, [], `${state.label}: DB should be reset to an empty array`);
    }

    console.log('--- ALL CHALLENGE TESTS PASSED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Challenge tests failed:', err.message);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
}

runTests();
