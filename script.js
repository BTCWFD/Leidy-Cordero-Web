document.addEventListener('DOMContentLoaded', () => {
    // 1. Navbar Sticky Effect
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 2. Mobile Menu Toggle
    const menuToggle = document.getElementById('mobile-menu');
    const navLinks = document.querySelector('.nav-links');

    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // Cierra el menú móvil al hacer click en un enlace
    document.querySelectorAll('.nav-links li a').forEach(link => {
        link.addEventListener('click', () => {
            if(navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
            }
        });
    });

    // 3. Intersection Observer for Scroll Animations
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 // 15% del elemento debe ser visible
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Añade clase para activar la animación CSS
                entry.target.classList.add('is-visible');
                // Opcional: Desactivar observador una vez animado
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Selecciona todos los elementos a animar
    const elementsToAnimate = document.querySelectorAll('.fade-in-up, .fade-in-right');
    elementsToAnimate.forEach(el => observer.observe(el));
});
