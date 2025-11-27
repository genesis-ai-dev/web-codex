// Mobile menu toggle
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navLinks = document.querySelector('.nav-links');
const navActions = document.querySelector('.nav-actions');

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        navActions.classList.toggle('active');
        mobileMenuToggle.classList.toggle('active');
    });
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href !== '#login' && href !== '#signup' && href !== '#contact' && href !== '#demo') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// Navbar scroll effect
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll <= 0) {
        navbar.style.boxShadow = 'none';
    } else {
        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    }

    lastScroll = currentScroll;
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards and pricing cards
document.querySelectorAll('.feature-card, .pricing-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(card);
});

// Code window typing animation
const codeElement = document.querySelector('.window-content code');
if (codeElement) {
    const originalCode = codeElement.innerHTML;
    let isAnimated = false;

    const codeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isAnimated) {
                isAnimated = true;
                codeElement.innerHTML = '';
                let index = 0;

                const typeWriter = () => {
                    if (index < originalCode.length) {
                        codeElement.innerHTML = originalCode.substring(0, index + 1);
                        index++;
                        setTimeout(typeWriter, 10);
                    }
                };

                setTimeout(typeWriter, 500);
            }
        });
    }, { threshold: 0.5 });

    codeObserver.observe(codeElement);
}

// Stats counter animation
const animateCounter = (element, target, duration = 2000) => {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
};

// Observe stats for counter animation
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const value = entry.target.textContent;
            if (value.includes('%')) {
                const num = parseFloat(value);
                entry.target.textContent = '0';
                setTimeout(() => {
                    animateCounter(entry.target, num);
                    setTimeout(() => {
                        entry.target.textContent = value;
                    }, 2000);
                }, 200);
            }
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-value').forEach(stat => {
    statsObserver.observe(stat);
});

// Handle form submissions (placeholders for now)
const handleFormSubmit = (e, formType) => {
    e.preventDefault();
    console.log(`${formType} form submitted`);
    // Add your form handling logic here
    alert(`${formType} form submitted! (This is a demo)`);
};

// Add click handlers for CTA buttons
document.querySelectorAll('a[href="#signup"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Sign up flow would start here! This is a demo marketing site.');
    });
});

document.querySelectorAll('a[href="#login"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Login flow would start here! This is a demo marketing site.');
    });
});

document.querySelectorAll('a[href="#demo"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Demo video would play here! This is a demo marketing site.');
    });
});

document.querySelectorAll('a[href="#contact"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Contact form would open here! This is a demo marketing site.');
    });
});

// Parallax effect for hero gradient
window.addEventListener('scroll', () => {
    const heroGradient = document.querySelector('.hero-gradient');
    if (heroGradient) {
        const scrolled = window.pageYOffset;
        heroGradient.style.transform = `translateX(-50%) translateY(${scrolled * 0.5}px)`;
    }
});

// Add hover effect to feature cards
document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    });
});

// Console message
console.log('%c👋 Welcome to Codex Web!', 'font-size: 20px; font-weight: bold; color: #667eea;');
console.log('%cInterested in the code? Check out our GitHub!', 'font-size: 14px; color: #9ca3af;');
