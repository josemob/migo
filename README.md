# 🐾 Migo — PetTech SuperApp

Ecosistema digital que conecta dueños de mascotas (B2C) con clínicas veterinarias (B2B).
Una sola API sirve a las 4 aplicaciones del ecosistema.

```
Backend API (Node/Express/TS · Google Cloud Run)
        │  ← REST/JSON, agnóstico de cliente
        ├── React Web       → Vet Dashboard (B2B)
        ├── React Web       → Super Admin
        ├── React Native    → App Vet (móvil)
        └── React Native    → App Cliente (móvil)
```

## Estructura del monorepo

```
C:\migo\
  server\           # ✅ Backend API (implementado)
  apps\             # (pendiente) web-vet, web-admin, mobile-client, mobile-vet
```

## Stack

- **Backend:** Node 20 · Express · TypeScript
- **Base de datos:** PostgreSQL (Supabase) vía **Prisma ORM**
- **Auth:** JWT (access + refresh con rotación)
- **IA / Triaje:** Google Gemini (`gemini-1.5-flash`) — pendiente de integrar
- **Video:** Agora.io — pendiente
- **Mapas:** Google Maps Platform — pendiente
- **Deploy:** Docker → Google Cloud Run

---

## 🚀 Puesta en marcha (server)

```bash
cd C:\migo\server
npm install
```

1. **Configura la base de datos.** Crea un proyecto en [Supabase](https://supabase.com) y copia las
   cadenas de conexión a `.env` (`DATABASE_URL` = pooler `:6543`, `DIRECT_URL` = directa `:5432`).
   Rellena también `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.

2. **Crea las tablas.**

   > ⚠️ **Nota Supabase:** en este proyecto el *session pooler* (5432) no acepta el
   > handshake de Postgres, así que `prisma migrate` / `db push` fallan (P1001). El
   > *transaction pooler* (6543) sí funciona por-sentencia. Por eso aplicamos el
   > esquema con un script propio:

   ```bash
   npm run db:sql     # genera el SQL del esquema (offline)
   npm run db:apply   # lo aplica vía el pooler 6543
   ```

3. **Carga datos de demo** (reproduce las pantallas Figma):

   ```bash
   npm run db:seed
   ```

4. **Arranca en desarrollo:**

   ```bash
   npm run dev
   ```

   API en `http://localhost:8080` · Health check: `GET /health`

**Login demo (Admin Local):** `maria.perez@migoclinicas.com` / `Migo1234`

---

## 🔌 API — `/api/v1`

Todas las rutas del dashboard requieren `Authorization: Bearer <accessToken>` y resuelven
automáticamente la sucursal del staff logueado.

| Módulo | Pantalla Figma | Endpoints principales |
|---|---|---|
| **auth** | Login | `POST /auth/login·register·refresh·logout` · `GET /auth/me` |
| **dashboard** | Panel de Control | `GET /dashboard/summary` |
| **appointments** | Agenda & Citas | `GET /appointments` · `GET/:id` · `POST` · `PATCH/:id` · `POST /:id/status` |
| **emergencies** | Urgencias & Guardia | `GET /active·/recent` · `POST /alerts/:id/seen·accept` · `POST /:id/attended` (genera CPL) |
| **patients** | Pacientes & Historiales | `GET /patients?search=&by=` · `GET /:petId` · `POST /:petId/records·vaccinations·allergies` |
| **staff** | Equipo & Staff | `GET /staff` · `GET /shifts/today` · `POST /staff` · `PATCH /:id` · `PUT /:id/shift` · `POST /validate-cmv` |
| **services** | Catálogo de Servicios | `GET/POST/PATCH/DELETE /services` |
| **clinic** | Configuración | `GET/PATCH /clinic` · `PUT /clinic/hours` |
| **finance** | Finanzas & Facturación | `GET /summary·/cpl·/invoices·/settlement` · `POST /invoices/generate·/:id/pay` |

---

## 💰 Modelo de negocio (reflejado en el modelo de datos)

- **CPL postpago:** la clínica paga a Migo **$5 por lead de urgencia atendido**. Se acumula en
  `LedgerEntry` (tipo `CPL`) y se agrupa en una `Invoice` en el corte del período. Mora → suspensión
  del radar (`Clinic.radarSuspended`).
- **Comisión por reserva:** Migo retiene 8-10% de las citas pagadas en la app.
- **Planes B2B:** `FREEMIUM` ($0) vs `PRO` (~$29-49/mes → prioridad en radar, comisión reducida).
- **Migo Care:** suscripción B2C del dueño (`Subscription`).

## ☁️ Deploy a Cloud Run

```bash
gcloud run deploy migo-api --source ./server --region us-central1 --allow-unauthenticated
```

El `Dockerfile` ya está listo (build multi-stage + Prisma). Configura las variables de entorno
en Cloud Run (nunca subas `.env`).
