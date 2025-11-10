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
ARG REACT_APP_AUTH_CLIENT_ID
ARG REACT_APP_AUTH_REGION
ARG REACT_APP_USER_POOL_ID

# Set environment variables for build
ENV REACT_APP_AUTH_CLIENT_ID=${REACT_APP_AUTH_CLIENT_ID}
ENV REACT_APP_AUTH_REGION=${REACT_APP_AUTH_REGION}
ENV REACT_APP_USER_POOL_ID=${REACT_APP_USER_POOL_ID}

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
