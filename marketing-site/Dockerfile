# Multi-stage build for marketing site
FROM nginx:alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy marketing site files
COPY index.html .
COPY css/ ./css/
COPY js/ ./js/
COPY pages/ ./pages/

# Create images directory (for future use)
RUN mkdir -p ./images

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Expose port 80
EXPOSE 80

# Labels for metadata
LABEL maintainer="Codex Web Team"
LABEL description="Marketing website for Codex Web platform"
LABEL version="1.0.0"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
