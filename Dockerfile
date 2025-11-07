# Multi-stage build for lean production image
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies first for better caching
COPY package.json tsconfig.json ./
RUN npm install

# Copy source and build
COPY src ./src
RUN npm run build

# Production image with only runtime deps
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
