# Build stage
FROM node:22-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build arguments for React environment variables
ARG REACT_APP_AUTH_AUTHORITY
ARG REACT_APP_AUTH_CLIENT_ID
ARG REACT_APP_COGNITO_DOMAIN
ARG REACT_APP_API_BASE_URL=/api

# Set environment variables for build
ENV REACT_APP_AUTH_AUTHORITY=${REACT_APP_AUTH_AUTHORITY}
ENV REACT_APP_AUTH_CLIENT_ID=${REACT_APP_AUTH_CLIENT_ID}
ENV REACT_APP_COGNITO_DOMAIN=${REACT_APP_COGNITO_DOMAIN}
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
