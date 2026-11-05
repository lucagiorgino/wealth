FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1
COPY frontend ./
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS test
COPY frontend ./
CMD ["npm", "test"]

FROM test AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM build AS browser-test
RUN npx playwright install --with-deps chromium
CMD ["npm", "run", "test:e2e"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
