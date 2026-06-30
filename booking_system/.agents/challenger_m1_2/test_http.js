const path = require('path');
const fs = require('fs');
const http = require('http');

// Setup environment variables before requiring server.js
const testDbPath = path.join(__dirname, 'test_database.sqlite');
const testJsonPath = path.join(__dirname, 'test_database.json');

// Clean up old files
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (e) {}
}
if (fs.existsSync(testJsonPath)) {
  try { fs.unlinkSync(testJsonPath); } catch (e) {}
}

process.env.PORT = '3999';
process.env.DATABASE_PATH = testDbPath;

console.log('Starting server under test...');
// Load the server which automatically initializes db and starts listening
require('../../server.js');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  // Wait a moment for server and database to be fully up
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    console.log('\n--- Test 1: Verify server started ---');
    // We can do a quick check by querying `/admin/citas` first (should be empty array)
    const initRes = await makeRequest({
      hostname: 'localhost',
      port: 3999,
      path: '/admin/citas',
      method: 'GET'
    });
    console.log('Initial bookings fetch status:', initRes.statusCode);
    console.log('Initial bookings fetch body:', initRes.body);
    if (initRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK from /admin/citas, got ${initRes.statusCode}`);
    }
    const initialBookings = JSON.parse(initRes.body);
    if (!Array.isArray(initialBookings) || initialBookings.length !== 0) {
      throw new Error(`Expected empty array, got: ${initRes.body}`);
    }
    console.log('SUCCESS: Server is running and responding with empty bookings array.');

    console.log('\n--- Test 2: Submit a valid booking ---');
    const booking1 = {
      name: 'Alice Cooper',
      date: '2026-07-05',
      time: '11:00',
      phone: '555-0199'
    };
    const postData1 = JSON.stringify(booking1);
    const postRes1 = await makeRequest({
      hostname: 'localhost',
      port: 3999,
      path: '/api/reservas',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData1)
      }
    }, postData1);
    console.log('Booking 1 response status:', postRes1.statusCode);
    console.log('Booking 1 response body:', postRes1.body);
    if (postRes1.statusCode !== 200) {
      throw new Error(`Expected 200 OK, got ${postRes1.statusCode}`);
    }
    const body1 = JSON.parse(postRes1.body);
    if (!body1.success || !body1.bookingId) {
      throw new Error(`Expected success and bookingId, got: ${postRes1.body}`);
    }
    console.log('SUCCESS: Valid booking submitted successfully.');

    console.log('\n--- Test 3: Verify DB file creation and size ---');
    // Check if either sqlite db or json db exists and has size > 0
    let dbFileExists = false;
    let dbFileSize = 0;
    let foundPath = '';
    if (fs.existsSync(testDbPath)) {
      dbFileExists = true;
      dbFileSize = fs.statSync(testDbPath).size;
      foundPath = testDbPath;
    } else if (fs.existsSync(testJsonPath)) {
      dbFileExists = true;
      dbFileSize = fs.statSync(testJsonPath).size;
      foundPath = testJsonPath;
    }
    console.log(`Database file found at: ${foundPath}`);
    console.log(`Database file size: ${dbFileSize} bytes`);
    if (!dbFileExists || dbFileSize === 0) {
      throw new Error('Database file does not exist or is 0 bytes.');
    }
    console.log('SUCCESS: DB file is created and has size > 0.');

    console.log('\n--- Test 4: Prevent double booking ---');
    // Try to book the exact same date and time slot
    const booking2 = {
      name: 'Bob Marley',
      date: '2026-07-05',
      time: '11:00',
      phone: '555-0200'
    };
    const postData2 = JSON.stringify(booking2);
    const postRes2 = await makeRequest({
      hostname: 'localhost',
      port: 3999,
      path: '/api/reservas',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData2)
      }
    }, postData2);
    console.log('Double booking response status:', postRes2.statusCode);
    console.log('Double booking response body:', postRes2.body);
    if (postRes2.statusCode !== 400) {
      throw new Error(`Expected 400 Bad Request for double booking, got ${postRes2.statusCode}`);
    }
    const body2 = JSON.parse(postRes2.body);
    if (body2.success !== false || !body2.error || !body2.error.includes('Double booking')) {
      throw new Error(`Expected success: false and Double booking error, got: ${postRes2.body}`);
    }
    console.log('SUCCESS: Double booking correctly blocked with 400 Bad Request.');

    console.log('\n--- Test 5: Verify appointments are listed at /admin/citas ---');
    const adminRes = await makeRequest({
      hostname: 'localhost',
      port: 3999,
      path: '/admin/citas',
      method: 'GET'
    });
    console.log('Admin appointments status:', adminRes.statusCode);
    console.log('Admin appointments body:', adminRes.body);
    if (adminRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK from /admin/citas, got ${adminRes.statusCode}`);
    }
    const bookingsList = JSON.parse(adminRes.body);
    if (!Array.isArray(bookingsList) || bookingsList.length !== 1) {
      throw new Error(`Expected array of length 1, got length ${bookingsList.length}`);
    }
    const matched = bookingsList[0];
    if (matched.name !== 'Alice Cooper' || matched.date !== '2026-07-05' || matched.time !== '11:00') {
      throw new Error(`Retrieved booking details mismatch: ${JSON.stringify(matched)}`);
    }
    console.log('SUCCESS: Appointment listed correctly at /admin/citas.');

    console.log('\n--- ALL HTTP SCRIPTS VERIFICATIONS PASSED! ---');
    
    // Clean up files before exiting
    try {
      if (fs.existsSync(testDbPath)) { fs.unlinkSync(testDbPath); }
      if (fs.existsSync(testJsonPath)) { fs.unlinkSync(testJsonPath); }
    } catch(e){}

    process.exit(0);
  } catch (err) {
    console.error('\nFAIL: Test run failed with error:', err.message);
    try {
      if (fs.existsSync(testDbPath)) { fs.unlinkSync(testDbPath); }
      if (fs.existsSync(testJsonPath)) { fs.unlinkSync(testJsonPath); }
    } catch(e){}
    process.exit(1);
  }
}

run();
