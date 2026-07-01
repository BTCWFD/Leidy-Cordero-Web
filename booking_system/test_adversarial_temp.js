const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('path');

const PORT = '3009';
const DB_PATH = 'citas_adversarial.json';
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

async function spawnServer(envOverrides = {}) {
  cleanupDbFiles();
  const serverScript = path.join(__dirname, 'server.js');
  
  serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      PORT: PORT,
      DATABASE_PATH: DB_PATH,
      DB_PATH: DB_PATH,
      ...envOverrides
    },
    stdio: 'ignore',
    shell: false,
  });

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
  console.log('--- STARTING ADVERSARIAL STRESS TESTS ---');
  
  // 1. Phone Format Tests
  await spawnServer({ FORCE_JSON_DB: 'true' });
  try {
    console.log('1. Checking valid phone format +1 (555) 019-2834 ext 12...');
    let res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Phone Patient', date: '2028-02-29', time: '10:00', phone: '+1 (555) 019-2834 ext 12' })
    });
    console.log(`Status for +1 (555) 019-2834 ext 12: ${res.status} (body: ${JSON.stringify(res.body)})`);

    console.log('2. Checking invalid phone format ---...');
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invalid Phone Patient', date: '2028-02-29', time: '11:00', phone: '---' })
    });
    console.log(`Status for ---: ${res.status} (body: ${JSON.stringify(res.body)})`);

    console.log('3. Checking leap year 0080-02-29...');
    res = await makeRequest('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Two-digit Leap Year Patient', date: '0080-02-29', time: '12:00', phone: '123456' })
    });
    console.log(`Status for 0080-02-29: ${res.status} (body: ${JSON.stringify(res.body)})`);
  } catch (err) {
    console.error('Error during basic checks:', err);
  } finally {
    stopServer();
  }

  // 2. Database Corruption Recovery
  console.log('4. Checking database corruption recovery...');
  const corruptStates = [
    { label: 'null', content: 'null' },
    { label: '{}', content: '{}' },
    { label: '123', content: '123' }
  ];
  for (const state of corruptStates) {
    await spawnServer({ FORCE_JSON_DB: 'true' });
    try {
      fs.writeFileSync(DB_PATH, state.content, 'utf8');
      let res = await makeRequest('/api/disponibilidad?date=2028-02-29');
      console.log(`Status for corrupt state ${state.label}: ${res.status} (success: ${res.body?.success})`);
      const repaired = fs.readFileSync(DB_PATH, 'utf8');
      console.log(`Repaired content: ${repaired.trim()}`);
    } catch (err) {
      console.error(`Error during corruption state ${state.label}:`, err);
    } finally {
      stopServer();
    }
  }

  // 3. Database table initialization fallback
  console.log('5. Checking database table initialization failure gracefully fallback to JSON...');
  // To simulate sqlite database table initialization failure, we can provide an invalid sqlite database path
  // or a directory path that is not writable/read-only, or use force flags.
  // Wait, database.js checks:
  // if (sqliteDb) { sqliteDb.run('CREATE TABLE...', (err) => { if (err) { fallback... } }) }
  // Let's test if we can cause a table creation error. E.g., locking the database or forcing an error.
  // Or we can see if forcing sqlite initialization to fail (like using process.env.FORCE_JSON_DB) works.
  // Wait, let's write a specific test or just see if the fallback works by checking database.js logic.
  console.log('Testing fallback by checking getMode()...');
  // We can pass a directory path instead of a file path for DB_PATH to force sqlite initialization to fail!
  // In SQLite, opening a directory as a database fails, or creating table fails.
  const dirDbPath = path.join(__dirname, 'temp_db_dir');
  if (!fs.existsSync(dirDbPath)) {
    fs.mkdirSync(dirDbPath);
  }
  
  await spawnServer({ DATABASE_PATH: dirDbPath, DB_PATH: dirDbPath });
  try {
    // If it initialized and fell back to JSON, it should handle getBookings successfully
    let res = await makeRequest('/api/disponibilidad?date=2028-02-29');
    console.log(`Status with invalid SQLite path (directory): ${res.status} (success: ${res.body?.success})`);
  } catch (err) {
    console.error('Error during fallback check:', err);
  } finally {
    stopServer();
    try { fs.rmdirSync(dirDbPath); } catch (e) {}
  }
}

runTests();
