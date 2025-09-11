FROM node:16-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

FROM node:16-alpine
WORKDIR /app
RUN addgroup -S nodeuser \
    && adduser -S nodeuser -G nodeuser
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app .
RUN chown -R nodeuser:nodeuser /app
EXPOSE 3001
USER nodeuser
CMD ["node", "server.js"]
