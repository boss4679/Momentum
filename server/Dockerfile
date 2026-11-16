# Debian-based (not alpine): bcrypt ships prebuilt native binaries, and glibc images
# avoid musl compatibility surprises.
FROM node:20-bookworm-slim

WORKDIR /app

# Copy the manifests first, so Docker reuses the cached `npm ci` layer whenever only
# source files change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4000
CMD ["npm", "start"]
