FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
# --host makes Vite listen on all interfaces, so it's reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host"]
