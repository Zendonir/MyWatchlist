# syntax=docker/dockerfile:1

# ---------- Frontend build ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Backend build ----------
FROM node:20-alpine AS backend-build
# Prisma's engine binaries need libssl to detect the right build and to run
# at all - without it, "prisma generate"/"migrate deploy" fail with a
# non-JSON "Error loading shared library libssl..." error.
RUN apk add --no-cache openssl
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---------- Runtime ----------
FROM node:20-alpine AS runtime
# openssl is required here too - "prisma migrate deploy" runs at container
# start (see CMD below), not just at build time.
RUN apk add --no-cache tini openssl
WORKDIR /app
ENV NODE_ENV=production
# Set from the release workflow's build-arg (the git tag) - "dev" for local/
# unreleased builds. Shown in the web UI under Settings.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

COPY --from=backend-build /app/backend/package*.json ./
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=frontend-build /app/frontend/dist ./public

RUN addgroup -S mywatchlist \
    && adduser -S mywatchlist -G mywatchlist \
    && mkdir -p /app/data \
    && chown -R mywatchlist:mywatchlist /app

USER mywatchlist
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
# Applies pending Prisma migrations against the mounted SQLite volume, then
# starts the server. Safe to run on every container start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
