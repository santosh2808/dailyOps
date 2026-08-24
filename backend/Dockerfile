# NestJS + Prisma backend image

# Node 20: bcrypt ABI
FROM node:20-bookworm-slim AS deps
RUN apt-get update  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# Schema first
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
# Native engine
RUN npx prisma generate

# Compile
FROM deps AS build
WORKDIR /app
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Runtime
FROM node:20-bookworm-slim AS runtime
RUN apt-get update  && apt-get install -y --no-install-recommends openssl ca-certificates curl  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production     PORT=4000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./
# Required by ts-node
COPY tsconfig.json ./
COPY prisma ./prisma
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh
EXPOSE 4000
# Non-root
USER node
# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD curl -fsS http://127.0.0.1:4000/health || exit 1
# Database setup, then app
CMD ["sh", "./entrypoint.sh"]
