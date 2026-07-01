document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('booking-date');
  const slotsContainer = document.getElementById('slots-container');
  const selectedTimeInput = document.getElementById('selected-time');
  const nameInput = document.getElementById('booking-name');
  const phoneInput = document.getElementById('booking-phone');
  const bookingForm = document.getElementById('booking-form');
  const confirmBtn = document.getElementById('confirm-booking');
  const feedbackMsg = document.getElementById('feedback-message');

  // Set the date picker minimum to today (YYYY-MM-DD in local time zone)
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const minDateStr = `${yyyy}-${mm}-${dd}`;
  dateInput.min = minDateStr;

  // Real-time client-side validation check
  function validateForm() {
    const date = dateInput.value;
    const time = selectedTimeInput.value;
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (date && time && name && phone) {
      confirmBtn.disabled = false;
      return true;
    } else {
      confirmBtn.disabled = true;
      return false;
    }
  }

  // Fetch available slots from server
  async function fetchSlots() {
    const dateVal = dateInput.value;
    if (!dateVal) {
      slotsContainer.innerHTML = '<p class="placeholder-text">Por favor, seleccione una fecha para ver los horarios disponibles.</p>';
      return;
    }

    slotsContainer.innerHTML = '<p class="loading-text">Cargando horarios disponibles...</p>';
    selectedTimeInput.value = '';
    validateForm();

    try {
      const response = await fetch(`/api/disponibilidad?date=${dateVal}`);
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        slotsContainer.innerHTML = '';
        const slots = data.availableSlots || [];
        if (slots.length === 0) {
          slotsContainer.innerHTML = '<p class="no-slots-text">No hay horarios disponibles para esta fecha. Intente con otro día.</p>';
          return;
        }

        slots.forEach(slot => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'slot-btn';
          btn.textContent = slot;
          btn.addEventListener('click', () => {
            // Unselect all other slot buttons
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
            // Select this button
            btn.classList.add('selected');
            selectedTimeInput.value = slot;
            validateForm();
          });
          slotsContainer.appendChild(btn);
        });
      } else {
        const p = document.createElement('p');
        p.className = 'error-text';
        p.textContent = `Error: ${data.error || 'No se pudieron cargar los horarios.'}`;
        slotsContainer.appendChild(p);
      }
    } catch (err) {
      console.error(err);
      slotsContainer.innerHTML = '<p class="error-text">Error de conexión al cargar horarios. Intente de nuevo.</p>';
    }
  }

  // Event Listeners
  dateInput.addEventListener('change', fetchSlots);
  nameInput.addEventListener('input', validateForm);
  phoneInput.addEventListener('input', validateForm);

  // Form submit handler
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Hide and reset feedback message
    feedbackMsg.classList.add('hidden');
    feedbackMsg.className = 'feedback-area hidden';
    feedbackMsg.innerHTML = '';

    if (!validateForm()) {
      feedbackMsg.textContent = 'Por favor, complete todos los campos obligatorios y seleccione un horario disponible.';
      feedbackMsg.classList.add('error');
      feedbackMsg.classList.remove('hidden');
      return;
    }

    const payload = {
      name: nameInput.value.trim(),
      date: dateInput.value,
      time: selectedTimeInput.value,
      phone: phoneInput.value.trim()
    };

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Procesando...';

    try {
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && data.success) {
        feedbackMsg.textContent = `¡Cita reservada con éxito! Código de reserva: ${data.bookingId}`;
        feedbackMsg.classList.add('success');
        feedbackMsg.classList.remove('hidden');
        
        // Reset form elements
        bookingForm.reset();
        selectedTimeInput.value = '';
        slotsContainer.innerHTML = '<p class="placeholder-text">Por favor, seleccione una fecha para ver los horarios disponibles.</p>';
        confirmBtn.disabled = true;
      } else {
        feedbackMsg.textContent = `Error: ${data.error || 'No se pudo procesar la reserva.'}`;
        feedbackMsg.classList.add('error');
        feedbackMsg.classList.remove('hidden');
        confirmBtn.disabled = false;
      }
    } catch (err) {
      console.error(err);
      feedbackMsg.textContent = 'Error de comunicación con el servidor. Intente más tarde.';
      feedbackMsg.classList.add('error');
      feedbackMsg.classList.remove('hidden');
      confirmBtn.disabled = false;
    } finally {
      confirmBtn.textContent = 'Confirmar Reserva';
    }
  });
});
