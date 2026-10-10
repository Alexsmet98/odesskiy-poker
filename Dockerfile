FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV TURNIR_DATA_FILE=/data/turnir.json
RUN mkdir -p /data
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
