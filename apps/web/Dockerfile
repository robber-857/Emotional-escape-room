FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 API_BASE_URL=http://api:8000
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci
COPY apps/web/ ./apps/web/
COPY apps/api/app/config/l2-overlap-masks.json ./apps/api/app/config/l2-overlap-masks.json
COPY content/l2-overlap-regression.json ./content/l2-overlap-regression.json
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 API_BASE_URL=http://api:8000
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "0.0.0.0"]
