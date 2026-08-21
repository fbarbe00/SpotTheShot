# Stage 1: Build the React application
FROM node:24-alpine AS build
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (clean install for reproducible builds)
RUN npm ci

# Copy source files
COPY . .

# Vite reads these values while compiling the static client. Compose forwards
# them as build arguments; runtime env_file values alone cannot change a built bundle.
ARG VITE_MAP_BBOX_SOUTH=35
ARG VITE_MAP_BBOX_WEST=-10
ARG VITE_MAP_BBOX_NORTH=70
ARG VITE_MAP_BBOX_EAST=40
ENV VITE_MAP_BBOX_SOUTH=$VITE_MAP_BBOX_SOUTH \
    VITE_MAP_BBOX_WEST=$VITE_MAP_BBOX_WEST \
    VITE_MAP_BBOX_NORTH=$VITE_MAP_BBOX_NORTH \
    VITE_MAP_BBOX_EAST=$VITE_MAP_BBOX_EAST

# Build the application
RUN npm run build
ENV NODE_ENV=production

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check - keeps container monitoring working
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/index.html || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
