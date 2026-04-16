# --- Base Stage ---
FROM node:lts-alpine AS base
WORKDIR /app
COPY src .

# --- Development Stage ---
FROM base AS development
RUN npm install
ENV NODE_ENV=development

# --- Production Stage ---
FROM base AS production
RUN npm ci --only=production
COPY --chown=node:node . .
ENV NODE_ENV=production
USER node
