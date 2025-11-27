# Codex Web Marketing Site

A modern, responsive marketing website for the Codex Web platform - a multi-tenant Kubernetes-based cloud development platform.

## Overview

This is a static marketing website built with vanilla HTML, CSS, and JavaScript. It's designed to be fast, lightweight, and easy to deploy without requiring a build process.

## Features

- **Modern Design**: Clean, professional design with gradient accents and dark theme
- **Fully Responsive**: Mobile-first design that works on all devices
- **Performance Optimized**: Lightweight with no framework dependencies
- **Smooth Animations**: Fade-in effects, hover states, and scroll animations
- **SEO Friendly**: Semantic HTML and proper meta tags
- **Interactive Elements**: Tabbed interfaces, code highlighting, and smooth scrolling

## Project Structure

```
marketing-site/
├── index.html              # Homepage
├── css/
│   ├── styles.css         # Main stylesheet for homepage
│   └── docs.css           # Documentation page styles
├── js/
│   ├── main.js            # Homepage JavaScript
│   └── docs.js            # Documentation page JavaScript
├── pages/
│   └── getting-started.html  # Getting started documentation
├── images/                # Image assets (optional)
└── README.md              # This file
```

## Quick Start

### Local Development

Simply open `index.html` in your browser:

```bash
# Using Python's built-in server
cd marketing-site
python3 -m http.server 8000

# Or using Node.js
npx serve .

# Then visit http://localhost:8000
```

### Deploy to Production

This site can be deployed to any static hosting service:

#### Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd marketing-site
netlify deploy --prod
```

#### Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd marketing-site
vercel --prod
```

#### AWS S3 + CloudFront
```bash
# Sync to S3 bucket
aws s3 sync . s3://your-bucket-name --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

#### GitHub Pages
```bash
# Push to gh-pages branch
git subtree push --prefix marketing-site origin gh-pages
```

## Pages

### Homepage (`index.html`)
- Hero section with value proposition
- Feature showcase grid
- Pricing tiers comparison
- Call-to-action section
- Footer with links

### Getting Started (`pages/getting-started.html`)
- Quick start guide
- Installation instructions
- Authentication setup
- API documentation
- Code examples with syntax highlighting

## Customization

### Colors
Edit CSS variables in `css/styles.css`:

```css
:root {
    --primary: #667eea;        /* Primary brand color */
    --primary-dark: #5568d3;   /* Darker shade */
    --secondary: #764ba2;      /* Secondary/accent color */
    --dark: #1a1a2e;          /* Background */
    --text: #e6e6e6;          /* Text color */
    --text-muted: #9ca3af;    /* Muted text */
}
```

### Logo
Replace the SVG logo in the navigation sections of both HTML files. The current logo is inline SVG for easy customization.

### Content
All content is in the HTML files. Key sections:
- **Hero**: Update the headline, description, and stats
- **Features**: Modify the feature cards in the features grid
- **Pricing**: Adjust pricing tiers and features
- **Documentation**: Edit content in `pages/getting-started.html`

## Performance

### Current Optimizations
- No external JavaScript frameworks
- Minimal CSS (< 50KB uncompressed)
- Web font preloading
- Lazy loading for animations
- CSS containment for better rendering

### Additional Optimizations
Consider adding:
- Image optimization (WebP format)
- CDN for static assets
- Service worker for offline support
- Critical CSS inlining

## Browser Support

- Chrome/Edge (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- iOS Safari (last 2 versions)
- Android Chrome (last 2 versions)

### Required Features
- CSS Grid
- CSS Custom Properties
- Intersection Observer API
- Flexbox

## Accessibility

The site includes:
- Semantic HTML5 elements
- ARIA labels for interactive elements
- Keyboard navigation support
- Sufficient color contrast ratios
- Responsive font sizes

### Testing
```bash
# Check accessibility with axe-core
npx @axe-core/cli index.html
```

## Analytics Integration

Add your analytics tracking code before the closing `</body>` tag:

### Google Analytics
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Plausible Analytics
```html
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

## Forms Integration

Update form action handlers in `js/main.js` to integrate with:
- **Netlify Forms**: Add `netlify` attribute to form tags
- **Formspree**: Set form action to `https://formspree.io/f/YOUR_ID`
- **Custom API**: Implement fetch calls to your backend

## SEO

### Meta Tags
The site includes basic meta tags. Consider adding:

```html
<!-- Open Graph -->
<meta property="og:title" content="Codex Web - Cloud Development Workspaces">
<meta property="og:description" content="Professional cloud-based development workspaces">
<meta property="og:image" content="/images/og-image.png">
<meta property="og:url" content="https://codexweb.dev">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Codex Web">
<meta name="twitter:description" content="Professional cloud-based development workspaces">
<meta name="twitter:image" content="/images/twitter-card.png">
```

### Sitemap
Create `sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://codexweb.dev/</loc>
    <lastmod>2024-01-01</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://codexweb.dev/pages/getting-started.html</loc>
    <lastmod>2024-01-01</lastmod>
    <priority>0.8</priority>
  </url>
</urlset>
```

### robots.txt
Create `robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://codexweb.dev/sitemap.xml
```

## Development Workflow

### Making Changes
1. Edit HTML/CSS/JS files
2. Refresh browser to see changes
3. Test on multiple devices/browsers
4. Commit changes to git

### Code Style
- Use 4 spaces for indentation
- Follow HTML5 semantic guidelines
- Keep CSS organized by component
- Add comments for complex logic

### Testing Checklist
- [ ] All links work correctly
- [ ] Forms submit properly
- [ ] Responsive on mobile/tablet/desktop
- [ ] Animations run smoothly
- [ ] No console errors
- [ ] Fast page load (< 3s)
- [ ] Accessible (WCAG AA)

## Contributing

To contribute to this marketing site:

1. Create a new branch for your changes
2. Make your modifications
3. Test thoroughly across devices
4. Submit a pull request with description

## Integration with Main App

The marketing site links to the main Codex Web application:

- Sign In button: Links to `/auth/login` (update to your app URL)
- Sign Up button: Links to `/auth/signup` (update to your app URL)
- Dashboard links: Point to app dashboard (update to your app URL)

Update these links in both `index.html` and `pages/getting-started.html`.

## Maintenance

### Regular Updates
- Update pricing information as needed
- Add new features to the features section
- Keep documentation current with API changes
- Update screenshots/images
- Review and update browser support

### Monitoring
Consider monitoring:
- Page load times (Google PageSpeed Insights)
- Broken links (Broken Link Checker)
- Uptime (UptimeRobot, Pingdom)
- Analytics metrics

## License

This marketing site is part of the Codex Web project. See the main project LICENSE file.

## Support

For questions or issues with the marketing site:
- Create an issue in the main repository
- Contact the marketing team
- Check the main project documentation

---

Built with ❤️ for the Codex Web platform
