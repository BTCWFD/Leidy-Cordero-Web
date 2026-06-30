# Handoff Report: Patient UI & Booking Endpoint Recommendations (Milestone 2)

## 1. Observation
We examined the following files in the project root directory:
*   `server.js`
*   `database.js`
*   `public/index.html` (currently a placeholder)
*   `test_booking.js` (E2E API test suite)

### Key Backend Observations:
*   **Request JSON Parser**: `server.js` uses `express.json()` middleware on line 9:
    ```javascript
    app.use(express.json());
    ```
*   **Static File Server**: `server.js` serves files from the `public` directory on line 10:
    ```javascript
    app.use(express.static(path.join(__dirname, 'public')));
    ```
*   **Booking Endpoint (`POST /api/reservas`)**:
    *   Lines 15-18 check for required request fields:
        ```javascript
        const { name, date, time, phone } = req.body;
        if (!name || !date || !time || !phone) {
          return res.status(400).json({ success: false, error: 'Missing required fields: name, date, time, phone' });
        }
        ```
    *   On success, returns `200 OK` with JSON:
        ```javascript
        { success: true, bookingId: string }
        ```
    *   On conflict/double-booking, returns `400 Bad Request` with:
        ```javascript
        res.status(400).json({ success: false, error: err.message });
        ```
*   **Availability Endpoint (`GET /api/disponibilidad`)**:
    *   Lines 57-60 check for a query parameter `date`:
        ```javascript
        const { date } = req.query;
        if (!date) {
          return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }
        ```
    *   Defines active hours from 09:00 to 17:00 on lines 64-65:
        ```javascript
        const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
        const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
        ```
    *   Returns JSON:
        ```javascript
        { success: true, date, availableSlots }
        ```

---

## 2. Logic Chain
1.  **Form Elements Integration**: Since `POST /api/reservas` requires fields `name`, `date`, `time`, and `phone`, our HTML form in `public/index.html` must provide input elements for name, phone, date, and a selectable mechanism for time slots.
2.  **API Integration on Date Change**: To show real-time slot availability, changing the date input must trigger a `fetch` request to `GET /api/disponibilidad?date=YYYY-MM-DD`. Since HTML's `<input type="date">` naturally uses the `YYYY-MM-DD` format, its value can be appended directly to the URL.
3.  **Slot Interaction**: The client-side logic must parse the `availableSlots` array from the availability API and present them as clickable buttons. Clicking a slot must select it, store the slot value in a hidden input or state variable, and visually highlight the active button.
4.  **Submission and Error Handling**: The submission handler must intercept the form submit event, pack the form fields into a JSON payload, and send it as a `POST` request. Due to potential double-booking or missing fields, the client must check `response.ok` and read the JSON response to display either the successful `bookingId` or the validation `error` gracefully in a styled container.

---

## 3. Caveats
*   **Testing Coverage**: The E2E tests in `test_booking.js` are backend-oriented and do not assert specific DOM elements, classes, or IDs. However, defining clear semantic IDs (e.g., `#booking-form`, `#name`, `#phone`, `#date`, `#time`, `#slots-container`) is essential for code maintainability and prospective frontend automation.
*   **Timezone & Past Dates**: The backend allows booking past dates (as seen in test `F1-T2-1: Query slots for a past date` returning availability). To avoid poor user experience, the client-side date input should disable selecting past dates (e.g., setting the `min` attribute to today's date).

---

## 4. Conclusion & Recommendations
We recommend the following frontend client architecture structure for the `public/` directory:

### A. HTML Structure (`public/index.html`)
The HTML should establish a professional look for the "Quiropodia LC" clinic, and provide fields mapping directly to the backend contracts.
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
    <h1>Quiropodia LC</h1>
    <p>Centro de Cuidado Podológico</p>
  </header>

  <main class="booking-container">
    <h2>Agende su Cita Médica</h2>
    <form id="booking-form" novalidate>
      <div class="form-group">
        <label for="name">Nombre Completo:</label>
        <input type="text" id="name" name="name" required placeholder="Ej. Juan Pérez">
      </div>
      
      <div class="form-group">
        <label for="phone">Teléfono de Contacto:</label>
        <input type="tel" id="phone" name="phone" required placeholder="Ej. +34 600 000 000">
      </div>
      
      <div class="form-group">
        <label for="date">Fecha de la Consulta:</label>
        <input type="date" id="date" name="date" required>
      </div>
      
      <div class="form-group">
        <label>Horarios Disponibles:</label>
        <div id="slots-container" class="slots-grid">
          <p class="info-text">Seleccione una fecha para cargar los horarios disponibles.</p>
        </div>
        <!-- Hidden field to keep track of the selected slot -->
        <input type="hidden" id="time" name="time" required>
      </div>
      
      <button type="submit" id="submit-btn" class="btn-primary">Confirmar Reserva</button>
    </form>
    
    <div id="message-container" class="message-container hidden"></div>
  </main>

  <script src="client.js"></script>
</body>
</html>
```

### B. Client-side Logic (`public/client.js`)
Handles slot retrieval, state tracking, validation, and JSON submission.
```javascript
document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('booking-form');
  const dateInput = document.getElementById('date');
  const timeInput = document.getElementById('time');
  const slotsContainer = document.getElementById('slots-container');
  const messageContainer = document.getElementById('message-container');

  // Restrict date selector to today and future dates
  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today);

  // Trigger availability check when date is selected
  dateInput.addEventListener('change', async (e) => {
    const selectedDate = e.target.value;
    timeInput.value = ''; // Reset slot selection
    slotsContainer.innerHTML = '<p class="info-text">Cargando horarios...</p>';
    hideMessage();

    if (!selectedDate) {
      slotsContainer.innerHTML = '<p class="info-text">Seleccione una fecha para cargar los horarios disponibles.</p>';
      return;
    }

    try {
      const response = await fetch(`/api/disponibilidad?date=${selectedDate}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al obtener disponibilidad.');
      }

      renderSlots(data.availableSlots);
    } catch (error) {
      console.error(error);
      slotsContainer.innerHTML = `<p class="error-text">No se pudo cargar la disponibilidad: ${error.message}</p>`;
    }
  });

  // Render slots as grid buttons
  function renderSlots(slots) {
    slotsContainer.innerHTML = '';
    if (!slots || slots.length === 0) {
      slotsContainer.innerHTML = '<p class="info-text">No hay turnos disponibles para esta fecha. Intente con otro día.</p>';
      return;
    }

    slots.forEach(slot => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot-btn';
      button.textContent = slot;
      
      button.addEventListener('click', () => {
        // Toggle selection status
        const activeBtn = slotsContainer.querySelector('.slot-btn.active');
        if (activeBtn) {
          activeBtn.classList.remove('active');
        }
        button.classList.add('active');
        timeInput.value = slot;
      });

      slotsContainer.appendChild(button);
    });
  }

  // Handle Form Submission
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();

    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const date = dateInput.value;
    const time = timeInput.value;

    // Client-side validation checks
    if (!name) return showMessage('Por favor, ingrese su nombre completo.', 'error');
    if (!phone) return showMessage('Por favor, ingrese un número de teléfono.', 'error');
    if (!date) return showMessage('Por favor, seleccione una fecha.', 'error');
    if (!time) return showMessage('Por favor, elija una hora para su cita.', 'error');

    try {
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date, time, phone })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showMessage(`¡Cita reservada con éxito! ID de Confirmación: ${data.bookingId}`, 'success');
        bookingForm.reset();
        timeInput.value = '';
        slotsContainer.innerHTML = '<p class="info-text">Seleccione una fecha para cargar los horarios disponibles.</p>';
      } else {
        showMessage(`Error: ${data.error || 'No se pudo agendar la cita.'}`, 'error');
      }
    } catch (error) {
      console.error(error);
      showMessage('Ocurrió un error al conectar con el servidor. Intente de nuevo.', 'error');
    }
  });

  function showMessage(text, type) {
    messageContainer.textContent = text;
    messageContainer.className = `message-container ${type}`;
    messageContainer.classList.remove('hidden');
  }

  function hideMessage() {
    messageContainer.textContent = '';
    messageContainer.className = 'message-container hidden';
  }
});
```

### C. Styling Guidelines (`public/style.css`)
Establishes a clean, professional aesthetic for a clinic:
```css
/* CSS Variables for design consistency */
:root {
  --primary: #0d9488;
  --primary-hover: #0f766e;
  --bg-main: #f8fafc;
  --bg-card: #ffffff;
  --border: #e2e8f0;
  --text: #1e293b;
  --text-light: #64748b;
  --error-bg: #fee2e2;
  --error-text: #991b1b;
  --success-bg: #dcfce7;
  --success-text: #166534;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: var(--bg-main);
  color: var(--text);
  margin: 0;
  padding: 0;
}

/* Header style */
.clinic-header {
  background-color: var(--primary);
  color: white;
  text-align: center;
  padding: 2rem 1rem;
}
.clinic-header h1 {
  margin: 0;
  font-size: 2rem;
}
.clinic-header p {
  margin: 0.5rem 0 0 0;
  font-weight: 300;
}

/* Container & Form card */
.booking-container {
  max-width: 550px;
  margin: 2rem auto;
  background: var(--bg-card);
  padding: 2.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.booking-container h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  color: var(--primary);
  text-align: center;
}

/* Input structures */
.form-group {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
}
.form-group label {
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.form-group input[type="text"],
.form-group input[type="tel"],
.form-group input[type="date"] {
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 1rem;
  transition: border-color 0.2s;
}
.form-group input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
}

/* Slots Grid layout */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding: 0.5rem 0;
}
.slot-btn {
  background: white;
  border: 1px solid var(--border);
  padding: 0.75rem 0.5rem;
  font-size: 0.95rem;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.slot-btn:hover {
  border-color: var(--primary);
  background-color: rgba(13, 148, 136, 0.05);
}
.slot-btn.active {
  background-color: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Form Action Button */
.btn-primary {
  width: 100%;
  background-color: var(--primary);
  color: white;
  border: none;
  padding: 0.85rem;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 1rem;
}
.btn-primary:hover {
  background-color: var(--primary-hover);
}

/* User alerts */
.message-container {
  margin-top: 1.5rem;
  padding: 1rem;
  border-radius: 5px;
  text-align: center;
  font-weight: 500;
}
.message-container.success {
  background-color: var(--success-bg);
  color: var(--success-text);
  border: 1px solid #bbf7d0;
}
.message-container.error {
  background-color: var(--error-bg);
  color: var(--error-text);
  border: 1px solid #fecaca;
}
.info-text {
  color: var(--text-light);
  grid-column: 1 / -1;
  text-align: center;
  margin: 0.5rem 0;
  font-style: italic;
}
.error-text {
  color: var(--error-text);
  grid-column: 1 / -1;
  text-align: center;
}
.hidden {
  display: none;
}
```

---

## 5. Verification Method
1.  **Code Placement**: Verify that the implementer writes the HTML, JS, and CSS to the exact paths `public/index.html`, `public/client.js`, and `public/style.css` respectively.
2.  **API Verification via E2E test runner**: Execute `node test_booking.js` in the project root to ensure that the backend endpoints used by the form (`POST /api/reservas` and `GET /api/disponibilidad`) operate successfully.
3.  **UI Manual Walkthrough**:
    *   Start the server manually via `PORT=3000 node server.js`.
    *   Open `http://localhost:3000` in a browser.
    *   Fill out the name and phone fields.
    *   Select a future date (e.g. tomorrow) from the date selector. Confirm that the slot buttons render dynamically.
    *   Select a slot (e.g. 10:00). Notice that the button turns green and is marked active.
    *   Click "Confirmar Reserva" and check that the success banner displays the ID.
    *   Repeat the booking for the exact same date and slot, confirming that a double-booking error banner is shown instead.
