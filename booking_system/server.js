const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST /api/reservas
app.post('/api/reservas', async (req, res) => {
  try {
    const { name, date, time, phone } = req.body;
    if (!name || !date || !time || !phone) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, date, time, phone' });
    }
    // Simple validation formats
    if (typeof name !== 'string' || name.trim() === '' ||
        typeof date !== 'string' || date.trim() === '' ||
        typeof time !== 'string' || time.trim() === '' ||
        typeof phone !== 'string' || phone.trim() === '') {
      return res.status(400).json({ success: false, error: 'Invalid fields format' });
    }

    // Date Format validation: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Date must be in YYYY-MM-DD format' });
    }

    // Valid calendar date check
    const dateParts = date.split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);
    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, error: 'Invalid date values' });
    }
    const calendarDate = new Date(year, month - 1, day);
    if (calendarDate.getFullYear() !== year || 
        (calendarDate.getMonth() + 1) !== month || 
        calendarDate.getDate() !== day) {
      return res.status(400).json({ success: false, error: 'Invalid calendar date' });
    }

    // Past Date check: compare date < new Date().toISOString().split('T')[0]
    if (date < new Date().toISOString().split('T')[0]) {
      return res.status(400).json({ success: false, error: 'Booking date cannot be in the past' });
    }

    // Phone number format validation: allow digits, spaces, hyphens, and leading +, limit length to 20
    if (!/^\+?[0-9\s\-]{3,20}$/.test(phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    const allowedSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    if (!allowedSlots.includes(time)) {
      return res.status(400).json({ success: false, error: 'Invalid slot time selected. Must be one of the allowed operating slots.' });
    }

    const result = await db.addBooking({ name, date, time, phone });
    res.status(200).json(result);
  } catch (err) {
    if (err.message.includes('Double booking detected')) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// GET /admin/citas
app.get('/admin/citas', async (req, res) => {
  try {
    let date = req.query.date;
    if (Array.isArray(date)) {
      date = date[0];
    }
    let bookings;
    if (date) {
      bookings = await db.getBookings(date);
    } else {
      bookings = await db.getAllBookings();
    }
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/disponibilidad
app.get('/api/disponibilidad', async (req, res) => {
  try {
    let date = req.query.date;
    if (Array.isArray(date)) {
      date = date[0];
    }
    if (!date) {
      return res.status(400).json({ success: false, error: 'Missing date parameter' });
    }
    const bookings = await db.getBookings(date);
    const bookedTimes = bookings.map(b => b.time);
    
    const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
    
    res.status(200).json({ success: true, date, availableSlots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start DB then server
db.initDb(DATABASE_PATH)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Database mode: ${db.getMode()}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
