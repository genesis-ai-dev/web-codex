// Documentation page specific JavaScript

// Tab functionality
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        const tabGroup = this.closest('.tabs').parentElement;

        // Remove active class from all buttons and contents in this group
        tabGroup.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        tabGroup.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Add active class to clicked button and corresponding content
        this.classList.add('active');
        tabGroup.querySelector(`.tab-content[data-tab="${tabName}"]`).classList.add('active');
    });
});

// Smooth scroll for sidebar links
document.querySelectorAll('.docs-nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        const href = this.getAttribute('href');

        if (href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);

            if (target) {
                // Update active state
                document.querySelectorAll('.docs-nav a').forEach(a => a.classList.remove('active'));
                this.classList.add('active');

                // Smooth scroll to section
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// Update active nav item on scroll
const sections = document.querySelectorAll('.docs-section');
const navLinks = document.querySelectorAll('.docs-nav a');

const observerOptions = {
    rootMargin: '-100px 0px -66%',
    threshold: 0
};

const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${id}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}, observerOptions);

sections.forEach(section => {
    if (section.id) {
        sectionObserver.observe(section);
    }
});

// Copy code button functionality
document.querySelectorAll('.code-block').forEach(block => {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 11V3C3 2.44772 3.44772 2 4 2H10" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Copy
    `;
    button.style.cssText = `
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.75rem;
        background: var(--dark);
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: 'Inter', sans-serif;
    `;

    button.addEventListener('mouseenter', () => {
        button.style.borderColor = 'var(--primary)';
        button.style.color = 'var(--primary)';
    });

    button.addEventListener('mouseleave', () => {
        if (!button.classList.contains('copied')) {
            button.style.borderColor = 'var(--border)';
            button.style.color = 'var(--text-muted)';
        }
    });

    button.addEventListener('click', async () => {
        const code = block.querySelector('code').textContent;

        try {
            await navigator.clipboard.writeText(code);
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L6 11L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Copied!
            `;
            button.classList.add('copied');
            button.style.color = 'var(--success)';
            button.style.borderColor = 'var(--success)';

            setTimeout(() => {
                button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M3 11V3C3 2.44772 3.44772 2 4 2H10" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    Copy
                `;
                button.classList.remove('copied');
                button.style.color = 'var(--text-muted)';
                button.style.borderColor = 'var(--border)';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy code:', err);
        }
    });

    block.style.position = 'relative';
    block.appendChild(button);
});

// Add anchor links to headings
document.querySelectorAll('.docs-section h2, .docs-section h3').forEach(heading => {
    if (heading.id) {
        heading.style.position = 'relative';
        heading.style.cursor = 'pointer';

        const anchor = document.createElement('a');
        anchor.href = `#${heading.id}`;
        anchor.className = 'heading-anchor';
        anchor.innerHTML = '#';
        anchor.style.cssText = `
            position: absolute;
            left: -1.5rem;
            opacity: 0;
            color: var(--primary);
            text-decoration: none;
            font-weight: 600;
            transition: opacity 0.2s ease;
        `;

        heading.style.position = 'relative';
        heading.appendChild(anchor);

        heading.addEventListener('mouseenter', () => {
            anchor.style.opacity = '1';
        });

        heading.addEventListener('mouseleave', () => {
            anchor.style.opacity = '0';
        });

        heading.addEventListener('click', () => {
            window.location.hash = heading.id;
        });
    }
});

// Search functionality (placeholder)
const addSearchBox = () => {
    const sidebar = document.querySelector('.docs-sidebar');
    if (sidebar && !document.querySelector('.docs-search')) {
        const searchBox = document.createElement('div');
        searchBox.className = 'docs-search';
        searchBox.innerHTML = `
            <input type="text" placeholder="Search documentation..." />
        `;
        searchBox.style.cssText = `
            margin-bottom: 2rem;
            padding: 0 1rem;
        `;

        const input = searchBox.querySelector('input');
        input.style.cssText = `
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--dark-light);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-size: 0.875rem;
            font-family: 'Inter', sans-serif;
            transition: border-color 0.2s ease;
        `;

        input.addEventListener('focus', () => {
            input.style.borderColor = 'var(--primary)';
        });

        input.addEventListener('blur', () => {
            input.style.borderColor = 'var(--border)';
        });

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.docs-nav a').forEach(link => {
                const text = link.textContent.toLowerCase();
                if (text.includes(query)) {
                    link.style.display = 'block';
                } else {
                    link.style.display = 'none';
                }
            });

            if (query === '') {
                document.querySelectorAll('.docs-nav a').forEach(link => {
                    link.style.display = 'block';
                });
            }
        });

        sidebar.insertBefore(searchBox, sidebar.firstChild);
    }
};

// Initialize search box
addSearchBox();

// Handle initial hash on page load
if (window.location.hash) {
    setTimeout(() => {
        const target = document.querySelector(window.location.hash);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
}

// Print styles awareness
if (window.matchMedia) {
    const mediaQueryList = window.matchMedia('print');
    mediaQueryList.addListener(() => {
        if (mediaQueryList.matches) {
            // Expand all collapsed sections when printing
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'block';
            });
        }
    });
}

console.log('%c📚 Codex Web Documentation', 'font-size: 16px; font-weight: bold; color: #667eea;');
console.log('%cNeed help? Check out our examples or reach out to support!', 'color: #9ca3af;');
