# syntax=docker/dockerfile:1
FROM node:20-alpine

# Install build tools needed for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy evaluation-worker package files first (for layer caching)
COPY evaluation-worker/package*.json ./evaluation-worker/

# Copy the Prisma schema — worker references it at ../yuktii-platform/prisma/schema.prisma
COPY yuktii-platform/prisma/schema.prisma ./yuktii-platform/prisma/schema.prisma

# Install worker dependencies
WORKDIR /app/evaluation-worker
RUN npm ci

# Copy rest of worker source
COPY evaluation-worker/ .

# Generate Prisma client against the shared schema
RUN npx prisma generate

# Run the worker
CMD ["npm", "run", "start"]
