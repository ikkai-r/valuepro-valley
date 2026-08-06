# Colyseus game server (client deploys separately on Vercel).
# Build context is the repo root because server/ imports shared/.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev

COPY shared ./shared
COPY server ./server

EXPOSE 2567
CMD ["npm", "start"]
