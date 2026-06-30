# Handoff Report: Frontend Client Architecture for Milestone 2

## Summary of Findings
- **Overview**: The backend API for availability query (`GET /api/disponibilidad?date=...`) and booking submission (`POST /api/reservas`) is fully implemented in `server.js` and integrated with SQLite/JSON persistence in `database.js`. We recommend a responsive, glassmorphism-styled patient booking interface in `public/index.html`, handled by a lightweight event-driven ES6 controller in `public/client.js` and styled cohesively with the parent site's design in `public/style.css`.

---

## 1. Observation
I directly observed the following from the project root files:

1. **Database Schema & Constraints**:
   - In `booking_system/database.js` lines 29-37:
     ```javascript
     sqliteDb.run(
       `CREATE TABLE IF NOT EXISTS citas (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         date TEXT NOT NULL,
         time TEXT NOT NULL,
         phone TEXT NOT NULL,
         UNIQUE(date, time)
       )`,
     ```
     This defines a uniqueness constraint on the combination of `(date, time)` to prevent double booking.

2. **Availability API Endpoint**:
   - In `booking_system/server.js` lines 54-71:
     ```javascript
     // GET /api/disponibilidad
     app.get('/api/disponibilidad', async (req, res) => {
       try {
         const { date } = req.query;
         if (!date) {
           return res.status(400).json({ success: false, error: 'Missing date parameter' });
         }
         const bookings = await db.getBookings(date);
         const bookedTimes = bookings.map(b => b.time);
         
         const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
         const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
         
         res.status(200).json({ success: true, date, availableSlots });
       ...
     ```
     This endpoint requires a `date` query parameter and returns a list of available slots matching a fixed schedule (`09:00` to `17:00`).

3. **Booking Endpoint**:
   - In `booking_system/server.js` lines 12-36:
     ```javascript
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
     
         const result = await db.addBooking({ name, date, time, phone });
         res.status(200).json(result);
       ...
     ```
     This endpoint receives JSON payloads with `name`, `date`, `time`, and `phone` fields, validating presence and non-empty strings before inserting into the database.

4. **Brand Design System**:
   - In the parent directory's stylesheet `style.css` (lines 1-12), the corporate color palette and glassmorphism styling are defined:
     ```css
     :root {
         --primary-color: #0B3B24; /* Deep emerald green */
         --primary-light: #1A593A;
         --accent-color: #D4AF37; /* Luxury Gold */
         --bg-color: #FAFAF9; /* Warm off-white */
         --text-main: #1A2E22;
         --text-light: #5A6D63;
         --white: #ffffff;
         --glass-bg: rgba(255, 255, 255, 0.85);
         --glass-border: rgba(212, 175, 55, 0.3);
         --shadow: 0 8px 32px 0 rgba(11, 59, 36, 0.1);
     }
     ```

---

## 2. Logic Chain
Based on these observations, I reasoned as follows:

1. **API Integration**: Since `server.js` requires a JSON body of `{ name, date, time, phone }` for `POST /api/reservas` and query parameters `?date=...` for `GET /api/disponibilidad`, our frontend client must programmatically fetch availability when a date is selected, capture user selections in state, and send formatted JSON payloads upon form submission.
2. **Form Interaction UX**: The availability grid cannot rely on static input fields because slot occupancy changes dynamically. Hence, the frontend needs to render the list of available slots dynamically as interactive capsule buttons, changing classes to highlight selection and updating a hidden input field for integration with form submission.
3. **Validations & Error Handling**: The backend throws a `400` status with `{ success: false, error: "Double booking detected..." }` if a conflict occurs (F2-T2-1). The frontend client must capture these responses, distinguish them from success states (`200 OK`), and render clear feedback to the patient.
4. **Style Consistency**: The patient UI should match the exact aesthetics of Quiropodia LC. Reusing CSS custom properties, fonts (`Outfit`), and layout helpers ensures a seamless visual transition when launching the booking form.

---

## 3. Caveats
- **Browser Compatibility**: The recommendations use modern ES6 features (e.g. `async/await`, `const`/`let`, `template literals`). In an environment requiring legacy browser support, code must be transpiled.
- **Client-Side Validation Limitations**: While client-side validation prevents unnecessary server requests, the server remains the single source of truth for validation and uniqueness constraints.
- **Localization**: The application UI is proposed in Spanish ("es") to match the brand identity of Quiropodia LC, while testing frameworks may look for basic response mappings.

---

## 4. Conclusion & Recommendations
We recommend implementing the following client-side architecture under the `booking_system/public/` folder:

### A. Recommended HTML Template (`public/index.html`)
Proposed HTML layout incorporating the clinic brand header, inputs, date picker, availability selector grid, and alert sections:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quiropodia LC | Agendar Cita</title>
  <!-- Google Fonts Link for brand fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="booking-container">
    <!-- Brand Header -->
    <header class="booking-header">
      <div class="logo">
        <img src="/logo.png" alt="Quiropodia LC Logo" class="logo-img" onerror="this.style.display='none'">
        <span class="brand-name">Quiropodia LC</span>
      </div>
      <h1>Agendar tu Cita</h1>
      <p>Selecciona una fecha y hora para tu consulta de podología profesional.</p>
    </header>

    <!-- Glassmorphic Booking Card -->
    <main class="contact-card glass-card">
      <form id="bookingForm" novalidate>
        <!-- Name Input -->
        <div class="input-group">
          <label for="name">Nombre Completo</label>
          <input type="text" id="name" name="name" required placeholder="Ej. Juan Pérez">
        </div>

        <!-- Phone Input -->
        <div class="input-group">
          <label for="phone">Teléfono / WhatsApp</label>
          <input type="tel" id="phone" name="phone" required placeholder="Ej. 320 478 1811">
        </div>

        <!-- Date Input -->
        <div class="input-group">
          <label for="date">Fecha de Cita</label>
          <input type="date" id="date" name="date" required>
        </div>

        <!-- Available Slots Area -->
        <div class="input-group">
          <label>Horarios Disponibles</label>
          <div id="slots-container" class="slots-grid">
            <p class="placeholder-text">Por favor, seleccione una fecha para ver horarios.</p>
          </div>
          <!-- Hidden field to hold selected time slot value -->
          <input type="hidden" id="time" name="time" required>
        </div>

        <!-- Submit Button -->
        <button type="submit" id="submitBtn" class="btn-primary btn-block">Confirmar Reserva</button>
      </form>

      <!-- Feedback Area -->
      <div id="feedback" class="feedback-message hidden" role="alert"></div>
    </main>
  </div>

  <script src="client.js"></script>
</body>
</html>
```

### B. Recommended Controller Logic (`public/client.js`)
Proposed implementation for availability loading, client-side validation, and form submission processing:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('bookingForm');
  const nameInput = document.getElementById('name');
  const phoneInput = document.getElementById('phone');
  const dateInput = document.getElementById('date');
  const timeInput = document.getElementById('time');
  const slotsContainer = document.getElementById('slots-container');
  const feedback = document.getElementById('feedback');
  const submitBtn = document.getElementById('submitBtn');

  // Enforce minimum booking date to today or later
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;

  // Render availability when date changes
  dateInput.addEventListener('change', async () => {
    const selectedDate = dateInput.value;
    
    // Reset slot selection and feedback
    timeInput.value = '';
    hideFeedback();
    
    if (!selectedDate) {
      slotsContainer.innerHTML = '<p class="placeholder-text">Por favor, seleccione una fecha para ver horarios.</p>';
      return;
    }

    try {
      slotsContainer.innerHTML = '<p class="loading-text">Buscando horarios disponibles...</p>';
      
      const response = await fetch(`/api/disponibilidad?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error('No se pudo consultar la disponibilidad.');
      }
      
      const data = await response.json();
      slotsContainer.innerHTML = ''; // Clear container

      if (data.availableSlots && data.availableSlots.length > 0) {
        data.availableSlots.forEach(slot => {
          const slotBtn = document.createElement('button');
          slotBtn.type = 'button';
          slotBtn.className = 'slot-btn';
          slotBtn.textContent = slot;
          slotBtn.dataset.time = slot;
          
          slotBtn.addEventListener('click', () => {
            // Remove selection class from other buttons
            document.querySelectorAll('.slot-btn').forEach(btn => btn.classList.remove('selected'));
            // Set active selection
            slotBtn.classList.add('selected');
            timeInput.value = slot;
          });
          
          slotsContainer.appendChild(slotBtn);
        });
      } else {
        slotsContainer.innerHTML = '<p class="info-text">No hay horarios disponibles para esta fecha. Intente con otro día.</p>';
      }
    } catch (error) {
      console.error(error);
      slotsContainer.innerHTML = '<p class="error-text">Ocurrió un error al cargar la disponibilidad. Intente de nuevo.</p>';
    }
  });

  // Handle booking form submission
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const date = dateInput.value;
    const time = timeInput.value;

    // Client-side validations
    if (!name) {
      showFeedback('Por favor, ingrese su nombre completo.', 'error');
      return;
    }
    if (!phone) {
      showFeedback('Por favor, ingrese su teléfono / WhatsApp.', 'error');
      return;
    }
    if (!date) {
      showFeedback('Por favor, elija una fecha para la cita.', 'error');
      return;
    }
    if (!time) {
      showFeedback('Por favor, elija un horario disponible.', 'error');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Procesando reserva...';

      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, phone, date, time })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showFeedback(`¡Cita reservada con éxito! ID de Reserva: ${data.bookingId}`, 'success');
        bookingForm.reset();
        slotsContainer.innerHTML = '<p class="placeholder-text">Por favor, seleccione una fecha para ver horarios.</p>';
        timeInput.value = '';
      } else {
        showFeedback(data.error || 'No se pudo procesar la reserva. Intente de nuevo.', 'error');
      }
    } catch (error) {
      console.error(error);
      showFeedback('Error de conexión con el servidor. Por favor, intente más tarde.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar Reserva';
    }
  });

  // Helper functions for feedback messages
  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `feedback-message ${type}`;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideFeedback() {
    feedback.textContent = '';
    feedback.className = 'feedback-message hidden';
  }
});
```

### C. Recommended Styles (`public/style.css`)
Proposed styling guidelines built directly on top of the Quiropodia LC colors and visual style:

```css
/* Import fonts */
body {
    font-family: 'Outfit', sans-serif;
    background-color: var(--bg-color);
    color: var(--text-main);
    line-height: 1.6;
    margin: 0;
    padding: 0;
}

/* Page container layout */
.booking-container {
    max-width: 650px;
    margin: 3rem auto;
    padding: 0 1.5rem;
}

/* Header style aligning with company logo */
.booking-header {
    text-align: center;
    margin-bottom: 2rem;
}
.booking-header h1 {
    font-size: 2.5rem;
    color: var(--primary-color);
    margin: 1rem 0 0.5rem 0;
}
.booking-header p {
    color: var(--text-light);
    margin: 0;
}

.logo {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
}
.logo-img {
    height: 40px;
    width: auto;
    border-radius: 5px;
}
.brand-name {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--primary-color);
}

/* Glassmorphism styling */
.glass-card {
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    box-shadow: var(--shadow);
    padding: 2.5rem;
}

/* Form structure */
.input-group {
    margin-bottom: 1.5rem;
    text-align: left;
}
.input-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--text-main);
}
.input-group input {
    width: 100%;
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 10px;
    font-family: inherit;
    font-size: 1rem;
    transition: border-color 0.3s ease;
    box-sizing: border-box;
}
.input-group input:focus {
    outline: none;
    border-color: var(--primary-color);
}

/* Slots grid styling */
.slots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 12px;
    margin-top: 0.8rem;
    min-height: 50px;
}
.slot-btn {
    background-color: var(--white);
    border: 1px solid var(--primary-color);
    color: var(--primary-color);
    padding: 0.8rem;
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
}
.slot-btn:hover {
    background-color: var(--primary-light);
    color: var(--white);
}
.slot-btn.selected {
    background-color: var(--primary-color);
    border-color: var(--accent-color);
    color: var(--white);
    transform: scale(1.05);
    box-shadow: 0 4px 10px rgba(11, 59, 36, 0.2);
}

/* Text styles inside slots area */
.placeholder-text, .loading-text, .info-text, .error-text {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-light);
    margin: 1rem 0;
    font-size: 0.95rem;
}
.error-text {
    color: #c5221f;
}

/* Buttons */
.btn-primary {
    padding: 1rem 1.5rem;
    border-radius: 50px;
    background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
    color: var(--white);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    border: none;
    font-size: 1.1rem;
    box-shadow: 0 4px 15px rgba(11, 59, 36, 0.2);
}
.btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(11, 59, 36, 0.3);
}
.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.btn-block {
    width: 100%;
    margin-top: 1rem;
}

/* Alert notifications styles */
.feedback-message {
    padding: 1rem;
    border-radius: 10px;
    margin-top: 1.5rem;
    font-weight: 600;
    font-size: 0.95rem;
    text-align: center;
}
.feedback-message.success {
    background-color: #e6f4ea;
    color: #137333;
    border-left: 4px solid #137333;
}
.feedback-message.error {
    background-color: #fce8e6;
    color: #c5221f;
    border-left: 4px solid #c5221f;
}
.feedback-message.hidden {
    display: none;
}

/* Responsive queries */
@media (max-width: 480px) {
    .glass-card {
        padding: 1.5rem;
    }
    .slots-grid {
        grid-template-columns: repeat(3, 1fr);
    }
    .booking-header h1 {
        font-size: 2rem;
    }
}
```

---

## 5. Verification Method
To verify that these recommendations are functional and work within the broader booking system workspace:

1. **Verify Backend Compliance**:
   - Ensure the server runs and serves static files. Run the following command from `booking_system/`:
     ```bash
     npm run start
     ```
   - Request availability with `curl` or a browser:
     ```bash
     curl "http://localhost:3000/api/disponibilidad?date=2026-08-01"
     ```
     *Expected Response*: `{ success: true, date: '2026-08-01', availableSlots: [...] }`
2. **Review Static File Serving**:
   - Check if visiting `http://localhost:3000/` properly serves `public/index.html`.
3. **Execute E2E Integration Suite**:
   - Run the E2E verification test suite from the `booking_system/` root directory to ensure no regressions occur with the backend logic:
     ```bash
     npm test
     ```
     *Expected Outcome*: All test cases across Tier 1, 2, 3, and 4 pass successfully.
