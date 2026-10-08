# Image for the API (backend/). Built from the REPOSITORY ROOT, not from
# backend/, because the API serves product images out of ./assets — see the
# fastifyStatic registration in backend/src/app.js, whose root resolves to
# ../../assets. A context of backend/ cannot see that folder.
#
#   docker build -t naftal-api .          <- from the repo root
#
# Debian slim rather than Alpine on purpose: argon2 is a native module and
# publishes prebuilt binaries for glibc, not musl. On Alpine npm falls back to
# compiling it, which means dragging in python3 and a full toolchain for no
# gain. openssl is installed because Prisma's query engine links against it.

FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Dependencies first, so a source-only change does not reinstall them.
COPY backend/package.json backend/package-lock.json ./

# Dev dependencies are kept deliberately: the Prisma CLI lives there and Fly's
# release_command runs `prisma migrate deploy` from this same image. Dropping
# them would save ~80 MB and break migrations.
RUN npm ci && npm cache clean --force

# The schema has to be present before generate, and on its own layer so that
# editing a route does not invalidate the generated client.
COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/src ./src

# Product images. Replace with PUBLIC_ASSET_BASE_URL pointing at R2 to drop
# ~20 MB from the image; until then they ship with it so a fresh deploy renders.
COPY assets /app/assets

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080

# Not `npm start`: npm swallows SIGTERM, so Fly's 5-second drain would kill the
# process mid-order instead of letting app.close() finish in-flight requests.
CMD ["node", "src/server.js"]
