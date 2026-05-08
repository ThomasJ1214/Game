FROM node:18-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY server.js ./
COPY docs/upgrades.js ./docs/

EXPOSE 3000

CMD ["node", "server.js"]
