# 🚀 Migo — Guía de despliegue

Arquitectura del deploy (todo en tiers **gratuitos**):

| Pieza | Dónde | Costo |
|---|---|---|
| **Base de datos** | Supabase (ya está en la nube) | Gratis |
| **Backend API** | Render (Web Service) | Gratis (se duerme tras ~15 min) |
| **Vet Dashboard** (web-vet) | Cloudflare Pages | Gratis |
| **Super Admin** (web-admin) | Cloudflare Pages | Gratis |
| **Apps móviles** | EAS Build (dev/preview) apuntando al backend | Gratis |

> El código ya quedó listo: el backend compila a `dist/`, los frontends a `dist/`,
> hay `render.yaml` y `_redirects` para el routing SPA. Solo falta conectarlo en tus cuentas.

---

## Paso 1 — Backend en Render

1. Crea cuenta en **render.com** (no pide tarjeta para el plan free).
2. **New + → Blueprint** → conecta el repo `josemob/migo`. Render lee `render.yaml` y crea el servicio **migo-api**.
   - *(Alternativa manual: New + → Web Service → Root Directory `server`, Build `npm install && npm run build`, Start `npm run start`, Health check `/health`.)*
3. En **Environment**, pega estos valores (desde tu `server/.env`):
   - `DATABASE_URL` — la de Supabase (pooler `:6543`, con `?pgbouncer=true`)
   - `DIRECT_URL` — la directa de Supabase (`:5432`)
   - `STREAM_API_KEY`, `STREAM_API_SECRET`
   - `GEMINI_API_KEY`
   - `CORS_ORIGINS` — déjalo por ahora en `*` o vacío; lo ajustas en el Paso 3.
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — Render los genera solos.
4. Deploy. Cuando termine, copia la URL (ej. `https://migo-api.onrender.com`).
5. Prueba: abre `https://migo-api.onrender.com/health` → debe responder `{"status":"ok"}`.

> La BD ya está provisionada en Supabase, así que **no hace falta migrar** en el primer
> deploy. Para cambios de esquema futuros: usa el **SQL Editor de Supabase** (tu red local
> bloquea el `:5432` que usan las migraciones de Prisma).

---

## Paso 2 — Frontends en Cloudflare Pages

Repite esto **dos veces** (una para cada panel):

1. Crea cuenta en **Cloudflare** → **Workers & Pages → Create → Pages → Connect to Git** → repo `josemob/migo`.
2. Configura el build:
   | Campo | web-vet | web-admin |
   |---|---|---|
   | **Root directory** | `apps/web-vet` | `apps/web-admin` |
   | **Build command** | `npm install && npm run build` | `npm install && npm run build` |
   | **Output directory** | `dist` | `dist` |
3. En **Environment variables** agrega:
   - `VITE_API_URL` = `https://migo-api.onrender.com/api/v1` (la URL del Paso 1 + `/api/v1`)
4. Deploy. Copia las dos URLs (ej. `https://migo-vet.pages.dev` y `https://migo-admin.pages.dev`).

> El `public/_redirects` ya incluido hace que el routing de React funcione en producción.

---

## Paso 3 — Ajustar CORS del backend

1. En Render → migo-api → **Environment**, edita `CORS_ORIGINS`:
   ```
   https://migo-vet.pages.dev,https://migo-admin.pages.dev
   ```
2. Guarda → Render redepliega solo. Ahora los paneles pueden hablar con el backend.

---

## Paso 4 — Apps móviles (opcional, para usarlas fuera del emulador)

1. En cada app (`apps/mobile-client`, `apps/mobile-vet`), pon en su `.env`:
   ```
   EXPO_PUBLIC_API_URL=https://migo-api.onrender.com/api/v1
   ```
2. Genera un build de distribución:
   ```bash
   cd apps/mobile-vet && eas build --profile preview --platform android
   ```
3. Instala el APK que te da EAS. Ya conecta al backend en la nube (sin depender de tu PC).

---

## Notas
- **Cold start:** el plan free de Render duerme el backend tras ~15 min sin tráfico; la primera petición tarda ~30-60s en despertar. Para producción real, un plan pago lo mantiene despierto.
- **Cuentas:** Render, Cloudflare y EAS requieren tu login — por eso estos pasos los ejecutas tú; el código ya está preparado.
- **Secretos:** nunca subas `.env` al repo (ya está gitignorado). Los valores se pegan solo en los dashboards.
