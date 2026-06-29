FROM node:20-bookworm-slim AS deps

WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY packages/shared/package*.json packages/shared/
COPY packages/bot/package*.json packages/bot/
COPY packages/dashboard/package*.json packages/dashboard/
RUN npm ci --ignore-scripts

FROM node:20-bookworm-slim AS build

WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate
RUN npm run build -w packages/bot

FROM node:20-bookworm-slim AS bot

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates python3 python3-pip && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
RUN pip3 install --break-system-packages --no-cache-dir -r packages/bot/src/python/requirements.txt
CMD ["npm", "start", "-w", "packages/bot"]

FROM node:20-bookworm-slim AS dashboard

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
RUN npm run build -w packages/dashboard
EXPOSE 3000
CMD ["npm", "start", "-w", "packages/dashboard"]
