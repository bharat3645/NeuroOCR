# Multi-stage build: compile the Vite app with Node, then serve the static
# output with nginx. The final image ships no Node.js, no source, and no
# node_modules — just the built assets (including the tfjs model files),
# which keeps the runtime image small and gives it a tiny attack surface.

# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Copy lockfile + manifest first so `npm ci` is cached across builds that
# only change application code.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run typecheck && npm run build

# --- Runtime stage ---
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
