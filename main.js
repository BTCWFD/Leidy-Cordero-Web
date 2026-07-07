document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Form submission simulation & WhatsApp redirect
    const form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const phone = document.getElementById('phone').value;
            const service = document.getElementById('service').value;
            
            const message = `Hola Quiropodia LC, mi nombre es ${name}, mi teléfono es ${phone} y me gustaría agendar una cita para el servicio de: ${service}.`;
            const whatsappUrl = `https://wa.me/3204781811?text=${encodeURIComponent(message)}`;
            
            window.open(whatsappUrl, '_blank');
            
            const btn = form.querySelector('button');
            const originalText = btn.textContent;
            
            btn.textContent = '¡Redirigiendo a WhatsApp...!';
            btn.style.background = '#25D366'; // WhatsApp color
            btn.style.color = '#fff';

            setTimeout(() => {
                form.reset();
                btn.textContent = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 3000);
        });
    }

    // FAQ Toggle
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all
            faqItems.forEach(i => i.classList.remove('active'));
            
            // Open clicked if it wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // Scroll reveal animation (simple version)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.service-card, .about-content, .contact-card, .testimonial-card, .faq-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });

    // === INTEGRACIÓN SISTEMA DE RESERVAS ONLINE ===
    
    // Configuración de endpoint base (vacío por defecto, redirige local en dev/GitHub Pages)
    let API_BASE_URL = '';
    if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
        API_BASE_URL = 'http://localhost:3000';
    }

    // Lógica de pestañas (Tabs)
    const tabWhatsapp = document.getElementById('btn-tab-whatsapp');
    const tabOnline = document.getElementById('btn-tab-online');
    const panelWhatsapp = document.getElementById('panel-whatsapp');
    const panelOnline = document.getElementById('panel-online');

    if (tabWhatsapp && tabOnline && panelWhatsapp && panelOnline) {
        tabWhatsapp.addEventListener('click', () => {
            tabWhatsapp.classList.add('active');
            tabWhatsapp.style.background = 'var(--primary-color)';
            tabWhatsapp.style.color = 'var(--white)';
            
            tabOnline.classList.remove('active');
            tabOnline.style.background = 'transparent';
            tabOnline.style.color = 'var(--text-main)';
            
            panelWhatsapp.style.display = 'block';
            panelOnline.style.display = 'none';
        });

        tabOnline.addEventListener('click', () => {
            tabOnline.classList.add('active');
            tabOnline.style.background = 'var(--primary-color)';
            tabOnline.style.color = 'var(--white)';
            
            tabWhatsapp.classList.remove('active');
            tabWhatsapp.style.background = 'transparent';
            tabWhatsapp.style.color = 'var(--text-main)';
            
            panelOnline.style.display = 'block';
            panelWhatsapp.style.display = 'none';
        });
    }

    // Elementos del formulario de reserva online
    const dateInput = document.getElementById('booking-date');
    const slotsContainer = document.getElementById('slots-container');
    const selectedTimeInput = document.getElementById('selected-time');
    const nameInput = document.getElementById('booking-name');
    const phoneInput = document.getElementById('booking-phone');
    const bookingForm = document.getElementById('onlineBookingForm');
    const confirmBtn = document.getElementById('confirm-booking');
    const feedbackMsg = document.getElementById('feedback-message');

    if (dateInput) {
        // Establecer el mínimo de fecha a hoy en zona horaria local
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.min = `${yyyy}-${mm}-${dd}`;
    }

    function validateOnlineForm() {
        if (!dateInput || !selectedTimeInput || !nameInput || !phoneInput || !confirmBtn) return false;
        
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

    async function fetchSlots() {
        if (!dateInput || !slotsContainer || !selectedTimeInput) return;
        
        const dateVal = dateInput.value;
        if (!dateVal) {
            slotsContainer.innerHTML = '<p class="placeholder-text" style="color: var(--text-light); font-style: italic; font-size: 0.9rem;">Por favor, seleccione una fecha para ver los horarios disponibles.</p>';
            return;
        }

        slotsContainer.innerHTML = '<p class="loading-text" style="color: var(--text-light); font-size: 0.9rem;">Cargando horarios disponibles...</p>';
        selectedTimeInput.value = '';
        validateOnlineForm();

        try {
            const response = await fetch(`${API_BASE_URL}/api/disponibilidad?date=${dateVal}`);
            if (!response.ok) {
                throw new Error(`HTTP status ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                slotsContainer.innerHTML = '';
                const slots = data.availableSlots || [];
                if (slots.length === 0) {
                    slotsContainer.innerHTML = '<p class="no-slots-text" style="grid-column: 1 / -1; color: var(--text-light); font-style: italic; font-size: 0.9rem; text-align: center;">No hay horarios disponibles para esta fecha. Intente con otro día.</p>';
                    return;
                }

                slots.forEach(slot => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'slot-btn';
                    btn.textContent = slot;
                    btn.addEventListener('click', () => {
                        slotsContainer.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        selectedTimeInput.value = slot;
                        validateOnlineForm();
                    });
                    slotsContainer.appendChild(btn);
                });
            } else {
                slotsContainer.innerHTML = '';
                const p = document.createElement('p');
                p.className = 'error-text';
                p.style.gridColumn = '1 / -1';
                p.style.color = '#b91c1c';
                p.style.fontSize = '0.9rem';
                p.style.textAlign = 'center';
                p.textContent = `Error: ${data.error || 'No se pudieron cargar los horarios.'}`;
                slotsContainer.appendChild(p);
            }
        } catch (err) {
            console.error(err);
            slotsContainer.innerHTML = '<p class="error-text" style="grid-column: 1 / -1; color: #b91c1c; font-size: 0.9rem; text-align: center;">Error de comunicación. Intente de nuevo.</p>';
        }
    }

    if (dateInput) {
        dateInput.addEventListener('change', fetchSlots);
    }
    if (nameInput) {
        nameInput.addEventListener('input', validateOnlineForm);
    }
    if (phoneInput) {
        phoneInput.addEventListener('input', validateOnlineForm);
    }

    if (bookingForm && feedbackMsg && confirmBtn) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            feedbackMsg.className = 'feedback-area hidden';
            feedbackMsg.innerHTML = '';

            if (!validateOnlineForm()) {
                feedbackMsg.textContent = 'Por favor, complete todos los campos obligatorios y seleccione un horario disponible.';
                feedbackMsg.className = 'feedback-area error';
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
                const response = await fetch(`${API_BASE_URL}/api/reservas`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (response.ok && data.success) {
                    feedbackMsg.textContent = `¡Cita reservada con éxito! Código de reserva: ${data.bookingId}`;
                    feedbackMsg.className = 'feedback-area success';
                    feedbackMsg.classList.remove('hidden');

                    bookingForm.reset();
                    selectedTimeInput.value = '';
                    slotsContainer.innerHTML = '<p class="placeholder-text" style="color: var(--text-light); font-style: italic; font-size: 0.9rem;">Por favor, seleccione una fecha para ver los horarios disponibles.</p>';
                    confirmBtn.disabled = true;
                } else {
                    feedbackMsg.textContent = `Error: ${data.error || 'No se pudo procesar la reserva.'}`;
                    feedbackMsg.className = 'feedback-area error';
                    feedbackMsg.classList.remove('hidden');
                    confirmBtn.disabled = false;
                }
            } catch (err) {
                console.error(err);
                feedbackMsg.textContent = 'Error de comunicación con el servidor. Intente más tarde.';
                feedbackMsg.className = 'feedback-area error';
                feedbackMsg.classList.remove('hidden');
                confirmBtn.disabled = false;
            } finally {
                confirmBtn.textContent = 'Confirmar Reserva en Línea';
            }
        });
    }
});

// Mobile menu toggle
const mobileMenu = document.getElementById('mobile-menu');
const navLinks = document.querySelector('.nav-links');
if (mobileMenu && navLinks) {
    mobileMenu.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        mobileMenu.classList.toggle('active');
    });
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            mobileMenu.classList.remove('active');
        });
    });
}
