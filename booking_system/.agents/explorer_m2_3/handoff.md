# Handoff Report: Frontend Client Architecture for Milestone 2

## 1. Observation

Based on a thorough read-only analysis of the project root files (`server.js`, `database.js`, and the existing E2E test suite `test_booking.js`), the following concrete details were observed:

### A. Database Schema and Constraints (`database.js`, lines 29-37)
The system stores reservations in a table called `citas` (SQLite or JSON database equivalent):
```sql
CREATE TABLE IF NOT EXISTS citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  phone TEXT NOT NULL,
  UNIQUE(date, time)
)
```
- **Fields required**: `name` (patient name), `date` (format `YYYY-MM-DD`), `time` (slot format `HH:MM`), `phone` (patient contact number).
- **Uniqueness constraint**: A double booking on the same date and time (`UNIQUE(date, time)`) triggers a database constraint error.

### B. Querying Availability (`server.js`, lines 54-71)
The backend exposes `GET /api/disponibilidad?date=YYYY-MM-DD`:
- **Query Parameter**: `date` (string). If missing, returns `400 Bad Request` with `{ success: false, error: 'Missing date parameter' }`.
- **Response Format (200 OK)**:
  ```json
  {
    "success": true,
    "date": "2026-08-01",
    "availableSlots": ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
  }
  ```
- **Logic**: It queries database appointments for that date and subtracts them from a hardcoded list of nine slots: `['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']`.

### C. Booking Endpoint (`server.js`, lines 12-36)
The backend exposes `POST /api/reservas` to create appointments:
- **Request Body Content-Type**: `application/json`
- **Payload Schema**: `{ name: string, date: string, time: string, phone: string }`
- **Validation**: Rejects with `400 Bad Request` if any of the fields are missing or not non-empty strings.
- **Response (200 OK - Success)**:
  ```json
  { "success": true, "bookingId": "1" }
  ```
- **Response (400/500 - Error)**:
  - If a double booking is detected: Returns `400 Bad Request` with `{ success: false, error: "Double booking detected: this slot is already reserved." }`.
  - Other errors: `{ success: false, error: error_message }`.

### D. Static File Serving (`server.js`, line 10)
- The server serves static files from the `public` directory:
  ```javascript
  app.use(express.static(path.join(__dirname, 'public')));
  ```
- This means `public/index.html` is served at `/`, `public/style.css` at `/style.css`, and `public/client.js` at `/client.js`.

---

## 2. Logic Chain

The observations above directly dictate the required frontend architecture:

1. **State Synchronization**:
   - Selecting a date triggers an asynchronous API call to `GET /api/disponibilidad?date=...`.
   - The returned `availableSlots` must be translated into clickable elements (buttons). Only available slots should be rendered or enabled.
   - When a slot is selected, its value must be stored in a hidden input or client state variable so it can be sent on submit.

2. **Form Submissions & Validation**:
   - The form should collect values for `name`, `phone`, `date`, and `time` (selected slot).
   - To avoid malformed payloads that trigger `400 Bad Request` on the server, client-side validation must check that:
     - `name` is not blank.
     - `phone` is not blank.
     - `date` is a valid date (and ideally not in the past).
     - `time` has been selected.
   - The submit button should remain disabled until all these fields are valid.

3. **Error and Success Feedbacks**:
   - On submission, client-side scripts make a `fetch` POST to `/api/reservas`.
   - If the server returns `200 OK` with `success: true` and a `bookingId`, the frontend must:
     - Show a clear success message with the generated booking ID.
     - Reset the form, inputs, and clear the slots container.
   - If the server returns a non-200 error, the client must capture the `error` message in the JSON payload (e.g. `"Double booking detected..."`) and display it in a red error alert box to the user.

---

## 3. Caveats

- **Past Dates**: The backend doesn't explicitly restrict bookings for past dates in the current schema. To maintain professional UX, the frontend date selector should enforce `min="YYYY-MM-DD"` dynamically in JavaScript based on the user's current date.
- **No JS Libraries**: The recommendations avoid heavy frontend libraries (React, Vue) or preprocessors (Sass) to match the light architectural design of this Node.js scaffolding. Pure HTML5, modern vanilla JavaScript (ES6+), and CSS variables are used.
- **Concurrent Bookings**: If another patient books the slot in the time between slot loading and form submission, the server will return a `400` error with a double booking message. The client must handle this case gracefully by displaying the error and prompting the user to select another slot.

---

## 4. Conclusion & Recommended Architecture

The proposed client architecture consists of three files located in `public/`:

### A. Recommended `public/index.html`
A semantic and accessible structure featuring a clinic banner, responsive grid, validation inputs, and a designated ARIA-polite feedback area.

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quiropodia LC - Sistema de Reservas</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="clinic-header">
    <div class="header-container">
      <h1 class="clinic-title">Quiropodia LC</h1>
      <p class="clinic-subtitle">Clínica Quiropódica Especializada &bull; Agenda tu cita en línea</p>
    </div>
  </header>

  <main class="booking-container">
    <section class="booking-card">
      <h2 class="card-title">Reserva tu Turno</h2>
      
      <!-- Dynamic Feedback Area -->
      <div id="feedback-message" class="feedback-msg hidden" aria-live="polite"></div>

      <form id="booking-form" novalidate>
        <!-- Date Selector -->
        <div class="form-group">
          <label for="booking-date" class="form-label">1. Selecciona la Fecha:</label>
          <input type="date" id="booking-date" name="date" class="form-input" required>
        </div>

        <!-- Available Slots Area -->
        <div class="form-group" id="slot-selection-group">
          <label class="form-label">2. Horas Disponibles:</label>
          <p id="slots-placeholder" class="slots-info-text">Por favor, selecciona una fecha para ver los turnos disponibles.</p>
          <div id="slots-container" class="slots-grid hidden"></div>
          
          <!-- Hidden input for selected slot linked to HTML validation -->
          <input type="hidden" id="selected-time" name="time" required>
        </div>

        <!-- Patient Name Input -->
        <div class="form-group">
          <label for="booking-name" class="form-label">3. Nombre Completo del Paciente:</label>
          <input type="text" id="booking-name" name="name" class="form-input" placeholder="Ej. Juan Pérez" required>
        </div>

        <!-- Patient Phone Input -->
        <div class="form-group">
          <label for="booking-phone" class="form-label">4. Teléfono de Contacto:</label>
          <input type="tel" id="booking-phone" name="phone" class="form-input" placeholder="Ej. 612 345 678" required>
        </div>

        <!-- Submit Button -->
        <button type="submit" id="submit-btn" class="submit-btn" disabled>Reservar Cita</button>
      </form>
    </section>
  </main>

  <script src="client.js"></script>
</body>
</html>
```

### B. Recommended `public/client.js`
A vanilla JS implementation featuring event delegation, live state checks, dynamic slot rendering, loading indicators, and response logic.

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('booking-form');
  const bookingDateInput = document.getElementById('booking-date');
  const slotsContainer = document.getElementById('slots-container');
  const slotsPlaceholder = document.getElementById('slots-placeholder');
  const selectedTimeInput = document.getElementById('selected-time');
  const submitBtn = document.getElementById('submit-btn');
  const feedbackMessage = document.getElementById('feedback-message');
  const nameInput = document.getElementById('booking-name');
  const phoneInput = document.getElementById('booking-phone');

  // Restrict past dates dynamically on client side
  const todayStr = new Date().toISOString().split('T')[0];
  bookingDateInput.setAttribute('min', todayStr);

  let selectedSlotButton = null;

  // Listen to date changes
  bookingDateInput.addEventListener('change', async (e) => {
    const selectedDate = e.target.value;
    
    // Clear previous slot states
    resetSlotSelection();
    checkFormValidity();
    
    if (!selectedDate) {
      showSlotsPlaceholder('Por favor, selecciona una fecha para ver los turnos disponibles.');
      return;
    }

    showSlotsPlaceholder('Buscando turnos disponibles...');
    
    try {
      const response = await fetch(`/api/disponibilidad?date=${encodeURIComponent(selectedDate)}`);
      if (!response.ok) {
        throw new Error('Error al consultar disponibilidad en el servidor.');
      }
      
      const data = await response.json();
      if (data.success && Array.isArray(data.availableSlots)) {
        renderSlots(data.availableSlots);
      } else {
        throw new Error(data.error || 'No se pudieron recuperar las horas disponibles.');
      }
    } catch (err) {
      console.error(err);
      showFeedback(`Error: ${err.message}`, 'error');
      showSlotsPlaceholder('No se pudieron cargar los turnos disponibles.');
    }
  });

  // Render clickable slot buttons
  function renderSlots(slots) {
    slotsContainer.innerHTML = '';
    
    if (slots.length === 0) {
      showSlotsPlaceholder('No hay turnos disponibles para la fecha seleccionada.');
      return;
    }
    
    slotsPlaceholder.classList.add('hidden');
    slotsContainer.classList.remove('hidden');

    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button'; // Prevent default form submit
      btn.className = 'slot-btn';
      btn.textContent = slot;
      btn.dataset.time = slot;
      
      btn.addEventListener('click', () => {
        // Toggle selected classes
        if (selectedSlotButton) {
          selectedSlotButton.classList.remove('selected');
        }
        
        btn.classList.add('selected');
        selectedSlotButton = btn;
        
        // Save state to hidden input
        selectedTimeInput.value = slot;
        
        // Re-evaluate form layout
        checkFormValidity();
      });
      
      slotsContainer.appendChild(btn);
    });
  }

  function resetSlotSelection() {
    selectedTimeInput.value = '';
    if (selectedSlotButton) {
      selectedSlotButton.classList.remove('selected');
      selectedSlotButton = null;
    }
    slotsContainer.innerHTML = '';
    slotsContainer.classList.add('hidden');
  }

  function showSlotsPlaceholder(text) {
    slotsPlaceholder.textContent = text;
    slotsPlaceholder.classList.remove('hidden');
    slotsContainer.classList.add('hidden');
  }

  // Real-time validator
  function checkFormValidity() {
    const isDateValid = bookingDateInput.value !== '';
    const isTimeValid = selectedTimeInput.value !== '';
    const isNameValid = nameInput.value.trim() !== '';
    const isPhoneValid = phoneInput.value.trim() !== '';

    if (isDateValid && isTimeValid && isNameValid && isPhoneValid) {
      submitBtn.removeAttribute('disabled');
    } else {
      submitBtn.setAttribute('disabled', 'true');
    }
  }

  nameInput.addEventListener('input', checkFormValidity);
  phoneInput.addEventListener('input', checkFormValidity);

  // Submit handler
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = nameInput.value.trim();
    const date = bookingDateInput.value;
    const time = selectedTimeInput.value;
    const phone = phoneInput.value.trim();

    if (!name || !date || !time || !phone) {
      showFeedback('Por favor, completa todos los campos del formulario.', 'error');
      return;
    }

    // Disable button to prevent multi-clicks
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.textContent = 'Procesando reserva...';
    hideFeedback();

    try {
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, date, time, phone })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        showFeedback(`¡Reserva confirmada con éxito! ID de Reserva: ${data.bookingId}`, 'success');
        
        // Reset form & slot selection
        bookingForm.reset();
        resetSlotSelection();
        checkFormValidity();
      } else {
        throw new Error(data.error || 'Ocurrió un error al procesar la reserva.');
      }
    } catch (err) {
      console.error(err);
      showFeedback(err.message, 'error');
      // Re-enable form validation state
      checkFormValidity();
    } finally {
      submitBtn.textContent = 'Reservar Cita';
    }
  });

  function showFeedback(message, type) {
    feedbackMessage.textContent = message;
    feedbackMessage.className = `feedback-msg ${type}`;
    feedbackMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideFeedback() {
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'feedback-msg hidden';
  }
});
```

### C. Recommended Styling Guidelines (`public/style.css`)
- **Theme Variables**: Use a cohesive color palette based on soft teals (representing health and clinic cleanliness) and light slate backgrounds.
- **Layout & Responsiveness**: Centered flexbox or grid layout maxing out at `600px` for mobile responsiveness.
- **Slots Grid**: A flexible CSS Grid container:
  ```css
  .slots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  ```
- **Slot Buttons**: Outline styles that transition smoothly to solid color upon `.selected` activation:
  ```css
  .slot-btn {
    padding: 0.75rem;
    border: 2px solid #2c7a7b;
    border-radius: 6px;
    background: transparent;
    color: #2c7a7b;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .slot-btn:hover {
    background: #edf2f7;
  }
  .slot-btn.selected {
    background: #2c7a7b;
    color: #ffffff;
    border-color: #2c7a7b;
  }
  ```
- **Alert States**: Success alerts should have a green background (`#c6f6d5`) and text (`#22543d`), while error alerts should have red (`#fed7d7`) and text (`#742a2a`) to match typical visual validation heuristics.

---

## 5. Verification Method

To verify the correct execution and database integration of the proposed UI and endpoints:
1. Ensure the backend server runs and binds correctly by running the project test suite:
   ```bash
   node test_booking.js
   ```
2. Manually launch the server locally on port 3000:
   ```bash
   node server.js
   ```
3. Open a browser and navigate to `http://localhost:3000`. Verify that:
   - The clinic title and header load.
   - Selecting a future date renders the available hour slots.
   - Selecting a slot highlights it and updates the submit button once name/phone are entered.
   - Submitting a valid reservation inserts the booking successfully and displays the ID.
   - Re-selecting the same date and slot displays a validation error or marks the slot unavailable.
