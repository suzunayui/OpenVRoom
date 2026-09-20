FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server/main.ts server/signaling.ts ./server/
COPY src/network/protocol.ts ./src/network/protocol.ts
USER node
CMD ["node", "server/main.ts"]
