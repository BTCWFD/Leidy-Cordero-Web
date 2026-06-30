const db = require('./database');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('--- STARTING DB VERIFICATION TESTS ---');
  const tempDbPath = path.join(__dirname, 'database_test.sqlite');
  
  // Clean up any old test db files
  if (fs.existsSync(tempDbPath)) {
    try {
      fs.unlinkSync(tempDbPath);
    } catch (e) {}
  }
  const tempJsonPath = path.join(__dirname, 'database_test.json');
  if (fs.existsSync(tempJsonPath)) {
    try {
      fs.unlinkSync(tempJsonPath);
    } catch (e) {}
  }

  try {
    // 1. Initialize
    console.log(`Initializing database at: ${tempDbPath}`);
    await db.initDb(tempDbPath);
    console.log(`Initialized successfully. Active Mode: ${db.getMode()}`);

    // 2. Add a booking
    console.log('Adding first booking...');
    const booking1 = {
      name: 'John Doe',
      date: '2026-07-01',
      time: '10:00',
      phone: '123456789'
    };
    const res1 = await db.addBooking(booking1);
    console.log('First booking added:', res1);

    // 3. Add same booking (double booking)
    console.log('Attempting double booking (should fail)...');
    try {
      await db.addBooking({
        name: 'Jane Smith',
        date: '2026-07-01',
        time: '10:00',
        phone: '987654321'
      });
      console.error('ERROR: Double booking succeeded! Uniqueness constraint failed.');
      process.exit(1);
    } catch (err) {
      console.log('SUCCESS: Double booking failed with expected error:', err.message);
    }

    // 4. Add booking at different time on same day
    console.log('Adding booking at different time...');
    const res2 = await db.addBooking({
      name: 'Jane Smith',
      date: '2026-07-01',
      time: '11:00',
      phone: '987654321'
    });
    console.log('Second booking added:', res2);

    // 5. Get bookings for date
    console.log('Retrieving bookings for 2026-07-01...');
    const bookings = await db.getBookings('2026-07-01');
    console.log('Bookings retrieved:', bookings);
    if (bookings.length !== 2) {
      console.error(`ERROR: Expected 2 bookings, got ${bookings.length}`);
      process.exit(1);
    }

    console.log('--- ALL DB VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Test run failed with error:', err);
    process.exit(1);
  } finally {
    // Clean up
    console.log('Cleaning up test database files...');
    try {
      if (fs.existsSync(tempJsonPath)) {
        fs.unlinkSync(tempJsonPath);
      }
    } catch (e) {}
  }
}

runTests();
