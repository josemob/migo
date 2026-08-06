# 🩺 Migo — Runbook de desarrollo

Guía rápida para arrancar los servicios del monorepo, sus rutas y las cuentas de prueba.

> ⚠️ Las credenciales de abajo son **cuentas de desarrollo (seed)**, todas con la misma
> contraseña de prueba. No son de producción. No usar estos valores en un entorno real.

---

## 1. Servicios y cómo arrancarlos

| Servicio | Comando (desde su carpeta) | Ruta / Puerto |
|---|---|---|
| **Backend API** | `cd server && npm run dev` | http://localhost:8080 · API base `/api/v1` · health `/health` |
| **Vet Dashboard** (web) | `cd apps/web-vet && npm run dev` | http://localhost:5173 |
| **Super Admin** (web) | `cd apps/web-admin && npm run dev` | http://localhost:5174 |
| **App Cliente** (móvil) | `cd apps/mobile-client && npx expo start --port 8081` | Metro :8081 |
| **App Vet** (móvil) | `cd apps/mobile-vet && npx expo start --port 8082` | Metro :8082 |

**Orden recomendado:** primero el **backend (:8080)**, luego las webs y/o el Metro de cada app.

### Apps móviles (Expo dev build)
- Necesitan su **dev build** instalado en el device/emulador (una sola vez).
- Primera vez o al cambiar módulos nativos:
  ```bash
  cd apps/mobile-vet && npx expo run:android
  ```
  Requisitos en Windows: emulador abierto, `JAVA_HOME` = JDK 17, `ANDROID_HOME` seteado,
  y `android/local.properties` con `sdk.dir=C:/Users/<user>/AppData/Local/Android/Sdk`.
- Bundle IDs: cliente `com.migo.client`, vet `com.migo.vet`.
- La URL del backend se toma de `EXPO_PUBLIC_API_URL` (`.env` de cada app).

### Backend
- Requiere `server/.env` (Supabase, Stream, Gemini). **No se versiona.**
- **Migraciones:** `prisma db push` puede fallar con `P1001` en el puerto `:5432`
  (a veces bloqueado por VPN/ISP). Alternativas: **SQL Editor de Supabase**, o aplicar el
  DDL vía el pooler `:6543` con un script `prisma.$executeRawUnsafe(...)`.

---

## 2. Puertos

`8080` API · `5173` Vet Dashboard · `5174` Super Admin · `8081` Metro cliente · `8082` Metro vet

---

## 3. Cuentas de prueba

**Contraseña para todas:** `Migo1234`

### 🟣 Super Admin — `web-admin` (:5174)
- `superadmin@migo.com`

### 🩺 Vet Dashboard — `web-vet` (:5173)  *(deben ser cuentas de staff con perfil de clínica)*
- `maria.perez@migoclinicas.com` — Admin Local (Las Mercedes)
- `carlos.ruiz@migoclinicas.com` — Veterinario
- `ana.lopez@migoclinicas.com`, `luis.martinez@migoclinicas.com` — staff
- ⚠️ **No** usar `admin@migoclinicas.com` (dueño de organización, sin `ClinicStaff` → 403)

### 🐾 App Cliente — `mobile-client`  *(dueños de mascotas)*
- `jose.mota@example.com` — José Mota (dueño de Toddy)
- `ana.gomez@example.com`, `laura.sol@example.com`, `marcos.pena@example.com`

### 🩺 App Vet — `mobile-vet`  *(staff / onboarding KYC)*
- `carlos.ruiz@migoclinicas.com` — ya es staff → dashboard completo
- Nuevos registros pasan por **KYC** (rol + selfie + cédula + carnet) → revisión del Super
  Admin → la clínica los **adopta por cédula** desde el Vet Dashboard → aceptan la
  invitación en la app → entran al dashboard.

---

## 4. Estructura del monorepo

```
server/            API (Node + Express + Prisma + Supabase)
apps/web-vet/      Vet Dashboard (React + Vite)   :5173
apps/web-admin/    Super Admin (React + Vite)     :5174
apps/mobile-client/ App cliente (Expo / RN)       Metro :8081
apps/mobile-vet/   App staff/vet (Expo / RN)      Metro :8082
```
