#!/bin/sh
set -e
npx prisma migrate deploy
# Seed a cada boot: sem ele a conta `treasury` não existe e todo depósito falha.
# O seed usa `upsert`, então repetir é inofensivo. Roda o JS compilado, e não
# `npm run prisma:seed` (`tsx prisma/seed.ts`): a imagem de runtime não copia
# `src/`, mas `dist/prisma/seed.js` importa `../src/config/constants.js`, que
# resolve para `dist/src/config/constants.js` — presente na imagem.
node dist/prisma/seed.js
node dist/src/index.js
