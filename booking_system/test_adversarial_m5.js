/**
 * test_adversarial_m5.js
 * Adversarial stress test suite for Milestone 5.
 */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('path');
const Module = require('module');

const PORT = '3010';
const TEST_DB_JSON = 'citas_adversarial.json';
const TEST_DB_SQLITE = 'citas_adversarial.sqlite';
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
  const files = [TEST_DB_JSON, TEST_DB_SQLITE];
  for (const f of files) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  }
}

async function spawnServer(envOverrides = {}) {
  cleanupDbFiles();
  const serverScript = path.join(__dirname, 'server.js');
  
  serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      PORT: PORT,
      DATABASE_PATH: TEST_DB_SQLITE,
      DB_PATH: TEST_DB_SQLITE,
      ...envOverrides
    },
    stdio: 'ignore',
    shell: false,
  });

  // Wait up to 3 seconds for server to start
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

async function runAdversarialTests() {
  console.log('=== STARTING ADVERSARIAL STRESS TESTS ===');

  // ----------------------------------------------------
  // SECTION 1: API Endpoint Valdation Tests
  // ----------------------------------------------------
  console.log('\n--- Section 1: API Validations ---');
  await spawnServer({ FORCE_JSON_DB: 'true' }); // run server in JSON mode for simplicity of setup

  try {
    // 1. Phone format +1 (555) 019-2834 ext 12 is accepted
    console.log('Testing: Phone format "+1 (555) 019-2834 ext 12"');
    let res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phone Ext Patient',
        date: '2028-05-10', // future date
        time: '14:00',
        phone: '+1 (555) 019-2834 ext 12'
      })
    });
    console.log(`  Response status: ${res.status}, body:`, res.body);
    assert.strictEqual(res.status, 200, 'Phone with extension should be accepted (200 OK)');
    assert.strictEqual(res.body.success, true);

    // 2. Non-numeric phone numbers like "---" are rejected
    console.log('Testing: Non-numeric phone "---"');
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Phone Patient',
        date: '2028-05-10',
        time: '15:00',
        phone: '---'
      })
    });
    console.log(`  Response status: ${res.status}, body:`, res.body);
    assert.strictEqual(res.status, 400, 'Non-numeric phone "---" should be rejected (400 Bad Request)');
    assert.strictEqual(res.body.success, false);

    // 3. Two-digit leap year dates like 0080-02-29 are accepted
    console.log('Testing: Two-digit leap year date "0080-02-29"');
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Leap Year Patient',
        date: '0080-02-29',
        time: '16:00',
        phone: '123456789'
      })
    });
    console.log(`  Response status: ${res.status}, body:`, res.body);
    // Since 0080-02-29 is in the past relative to current date (2026), it may be rejected as a past date.
    // However, it must NOT be rejected as "Invalid calendar date".
    if (res.status === 400) {
      assert.strictEqual(res.body.error, 'Booking date cannot be in the past', 
        '0080-02-29 calendar date validation should pass, only failing past date check');
      console.log('  Confirmed: 0080-02-29 is accepted as a valid calendar date (rejected only as past date)');
    } else {
      assert.strictEqual(res.status, 200, '0080-02-29 should be accepted');
      console.log('  Confirmed: 0080-02-29 accepted with 200 OK');
    }

    // Let's also verify that 0081-02-29 (non-leap year) is rejected as "Invalid calendar date"
    console.log('Testing: Two-digit non-leap year date "0081-02-29"');
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Non-Leap Year Patient',
        date: '0081-02-29',
        time: '16:00',
        phone: '123456789'
      })
    });
    console.log(`  Response status: ${res.status}, body:`, res.body);
    assert.strictEqual(res.status, 400, '0081-02-29 should be rejected (400)');
    assert.strictEqual(res.body.error, 'Invalid calendar date');
    console.log('  Confirmed: Non-leap year 0081-02-29 successfully rejected as invalid calendar date');

  } finally {
    stopServer();
  }

  // ----------------------------------------------------
  // SECTION 2: Database Robustness Tests
  // ----------------------------------------------------
  console.log('\n--- Section 2: Database Robustness ---');

  // Let's test non-array JSON corruption recovery
  console.log('Testing: JSON DB corruption recovery');
  const corruptValues = ['null', '123', '"string"', '{"citas":[]}', ''];
  const testDbFile = path.join(__dirname, 'citas_test_corruption.json');

  // Helper to clear require cache
  delete require.cache[require.resolve('./database')];
  const db = require('./database');

  for (const val of corruptValues) {
    if (fs.existsSync(testDbFile)) {
      fs.unlinkSync(testDbFile);
    }
    // Write corrupt content
    fs.writeFileSync(testDbFile, val, 'utf8');

    // Initialize database
    await db.initDb(testDbFile);

    // Verify it recovers: getBookings should return empty array and not throw
    const bookings = await db.getBookings('2026-08-01');
    assert.deepStrictEqual(bookings, [], `Corruption value "${val}" should recover to empty array`);

    // Verify the file was corrected to []
    const fileContent = fs.readFileSync(testDbFile, 'utf8').trim();
    assert.ok(fileContent === '[]' || fileContent.startsWith('['), `File content should be recovered: ${fileContent}`);
    console.log(`  Confirmed: Corruption with "${val}" was gracefully handled and recovered.`);
  }

  // Let's test SQLite initialization failure fallback
  console.log('Testing: Database table/db initialization fails fallback');

  // We mock sqlite3 module load/open failure
  const originalRequire = Module.prototype.require;
  let mockSqliteMode = 'fail_open'; // 'fail_open' or 'fail_table'

  Module.prototype.require = function (id) {
    if (id === 'sqlite3') {
      return {
        verbose: () => ({
          Database: function (dbPath, callback) {
            if (mockSqliteMode === 'fail_open') {
              process.nextTick(() => callback(new Error('Mocked SQLite Open Failure')));
            } else {
              // Open succeeds
              process.nextTick(() => callback(null));
              return {
                configure: () => {},
                run: function (sql, runCallback) {
                  if (sql.includes('CREATE TABLE')) {
                    // Table creation fails
                    process.nextTick(() => runCallback(new Error('Mocked CREATE TABLE Failure')));
                  } else {
                    process.nextTick(() => runCallback(null));
                  }
                },
                close: function (closeCallback) {
                  if (closeCallback) process.nextTick(closeCallback);
                }
              };
            }
          }
        })
      };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    // Test open database failure
    console.log('  Testing fallback on SQLite open database failure...');
    delete require.cache[require.resolve('./database')];
    const dbFallback1 = require('./database');
    const sqlitePath1 = path.join(__dirname, 'test_fail1.sqlite');
    const expectedJsonPath1 = path.join(__dirname, 'test_fail1.json');

    if (fs.existsSync(sqlitePath1)) fs.unlinkSync(sqlitePath1);
    if (fs.existsSync(expectedJsonPath1)) fs.unlinkSync(expectedJsonPath1);

    mockSqliteMode = 'fail_open';
    await dbFallback1.initDb(sqlitePath1);

    assert.strictEqual(dbFallback1.getMode(), 'json', 'Should fallback to JSON mode on SQLite open failure');
    assert.ok(fs.existsSync(expectedJsonPath1), 'JSON database file should be created');
    console.log('    Passed: Successfully fell back to JSON mode on open failure.');

    // Test table creation failure
    console.log('  Testing fallback on SQLite table creation failure...');
    delete require.cache[require.resolve('./database')];
    const dbFallback2 = require('./database');
    const sqlitePath2 = path.join(__dirname, 'test_fail2.sqlite');
    const expectedJsonPath2 = path.join(__dirname, 'test_fail2.json');

    if (fs.existsSync(sqlitePath2)) fs.unlinkSync(sqlitePath2);
    if (fs.existsSync(expectedJsonPath2)) fs.unlinkSync(expectedJsonPath2);

    mockSqliteMode = 'fail_table';
    await dbFallback2.initDb(sqlitePath2);

    assert.strictEqual(dbFallback2.getMode(), 'json', 'Should fallback to JSON mode on SQLite table creation failure');
    assert.ok(fs.existsSync(expectedJsonPath2), 'JSON database file should be created');
    console.log('    Passed: Successfully fell back to JSON mode on table creation failure.');

    // Clean up fallback test files
    if (fs.existsSync(sqlitePath1)) fs.unlinkSync(sqlitePath1);
    if (fs.existsSync(expectedJsonPath1)) fs.unlinkSync(expectedJsonPath1);
    if (fs.existsSync(sqlitePath2)) fs.unlinkSync(sqlitePath2);
    if (fs.existsSync(expectedJsonPath2)) fs.unlinkSync(expectedJsonPath2);
    if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

  } finally {
    // Restore original require
    Module.prototype.require = originalRequire;
  }

  console.log('\n=== ALL ADVERSARIAL STRESS TESTS PASSED SUCCESSFULLY ===');
}

runAdversarialTests().catch(err => {
  console.error('Adversarial tests failed:', err);
  process.exit(1);
});
