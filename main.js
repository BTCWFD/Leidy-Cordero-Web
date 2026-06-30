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
            const service = document.getElementById('service').value;
            
            const message = `Hola Quiropodia LC, mi nombre es ${name} y me gustaría agendar una cita para el servicio de: ${service}.`;
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

    // Scroll reveal animation (simple version)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.service-card, .about-content, .contact-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });
});
