FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini wget python3 make g++
WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/data/kairotrack.db \
    PORT=3000 \
    FRONTEND_DIR=/app/frontend/dist
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root \
    && apk del python3 make g++ \
    && npm cache clean --force
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/dist/index.js"]
