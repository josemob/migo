# Migo — Documentación del proyecto

> **Migo** es una *SuperApp* de PetTech que conecta a **dueños de mascotas** (B2C) con
> **clínicas veterinarias y veterinarios independientes** (B2B): agendamiento, expediente
> médico, chat, teleconsulta por video, emergencias con ruteo geográfico, pagos/facturación,
> notificaciones push y un asistente de IA — todo en un mismo ecosistema.

**Última actualización:** 2026-08-24 · **Estado:** MVP funcional, en preparación para Google Play.

---

## Tabla de contenido

1. [Visión de producto](#1-visión-de-producto)
2. [Los actores y sus apps](#2-los-actores-y-sus-apps)
3. [Funcionalidades por app](#3-funcionalidades-por-app)
4. [Arquitectura general](#4-arquitectura-general)
5. [Stack tecnológico](#5-stack-tecnológico)
6. [Estructura del monorepo](#6-estructura-del-monorepo)
7. [Backend: módulos y API](#7-backend-módulos-y-api)
8. [Modelo de datos](#8-modelo-de-datos)
9. [Servicios externos](#9-servicios-externos)
10. [Entornos y despliegue](#10-entornos-y-despliegue)
11. [Cómo correr el proyecto en local](#11-cómo-correr-el-proyecto-en-local)
12. [Build y publicación móvil (Android)](#12-build-y-publicación-móvil-android)
13. [Convenciones y notas de operación](#13-convenciones-y-notas-de-operación)
14. [Roadmap y pendientes](#14-roadmap-y-pendientes)

---

## 1. Visión de producto

Migo resuelve la fragmentación del cuidado veterinario. Hoy un dueño de mascota usa WhatsApp
para agendar, papel o PDFs sueltos para el expediente, y no tiene forma rápida de atender una
**emergencia**. Del otro lado, las clínicas carecen de una herramienta unificada de agenda,
historia clínica, cobro y comunicación con el cliente.

Migo unifica todo en un ecosistema con cuatro superficies (dos apps móviles + dos web) sobre un
mismo backend, e incorpora un **asistente de IA** (triaje, sugerencias de agendamiento por raza)
y un modelo de negocio de **suscripciones + contenido patrocinado + comisiones/facturación**.

**Propuesta de valor**

| Para el dueño (B2C) | Para la clínica / vet (B2B) |
|---|---|
| Agenda citas y teleconsultas | Agenda unificada y gestión de turnos del staff |
| Expediente médico siempre a mano (PDF/compartir) | Historia clínica digital con firma del veterinario |
| Botón de emergencia con ruteo al vet más cercano | Recepción de emergencias por especialidad/radio |
| Chat y video con la clínica | Chat y video integrados (Stream) |
| Recibos y facturas de sus pagos | Cobro in-app + facturación + liquidaciones |
| Asistente Migo IA | Sugerencias de IA y contenido patrocinado |

---

## 2. Los actores y sus apps

| Actor | Superficie | Descripción |
|---|---|---|
| **Dueño de mascota** | `mobile-client` (Android) | App B2C. Gestiona mascotas, citas, expediente, chat, emergencias, pagos. |
| **Veterinario / staff de clínica** | `mobile-vet` (Android) | App B2B móvil. Atiende citas, crea expedientes, chatea, recibe emergencias. |
| **Clínica veterinaria** | `web-vet` | Panel web de la clínica: agenda, pacientes, teleconsulta, chat. |
| **Super Admin (Migo)** | `web-admin` | Panel de operación de la plataforma: usuarios, clínicas, KYC, marketing, finanzas. |

Un **veterinario es independiente por defecto** al registrarse; deja de serlo cuando una clínica
lo recluta. Los vets independientes requieren un **plan de suscripción de telemedicina**.

---

## 3. Funcionalidades por app

### 3.1 App Cliente (`mobile-client`)
- **Mascotas**: alta con raza, alergias, condiciones, vacunas, prescripciones.
- **Directorio de clínicas**: búsqueda, detalle (pestaña *Servicios* primero y preseleccionada),
  reseñas con *pills* de calificación centradas.
- **Agendamiento**: reserva de citas con horas pasadas deshabilitadas; sugerencias de IA
  (p. ej. grooming según intervalo por raza).
- **Expediente médico**: el dueño ve el detalle de cada consulta y puede **descargar/compartir PDF**;
  conserva los registros aunque cambie o se retire el veterinario (firma persistente).
- **Chat y video**: mensajería y teleconsulta (Stream).
- **Emergencias**: botón de emergencia con geolocalización → ruteo al veterinario disponible.
- **Pagos y facturación**: pago in-app, **recibos/facturas** visibles en la app (PDF + email).
- **Notificaciones push** (FCM): recordatorios, emergencias, confirmaciones.
- **Migo IA**: asistente conversacional (Gemini).
- **Login**: email/contraseña + **Google Sign-In nativo**.

### 3.2 App Vet (`mobile-vet`)
- **Agenda** y gestión de citas del veterinario.
- **Creación de expediente/consulta**: con *"Finalizar y firmar"* y *"marcar cita como concluida"*
  dentro del mismo flujo; la firma queda como *snapshot* (nombre, licencia, especialidad).
- **Chat y video** con el dueño.
- **Emergencias**: recepción y atención según especialidad/radio.
- **Perfil del vet** (`VetProfile`) y suscripción (`VetSubscription`) para vets independientes.
- Icono de marca propio (blanco sobre morado `#7F398A`).

### 3.3 Web Clínica (`web-vet`)
- Panel de la clínica: agenda, pacientes, servicios y staff.
- **Teleconsulta por video** y **chat** integrados (Stream React SDK).

### 3.4 Web Super Admin (`web-admin`)
- Gestión de **usuarios, clínicas y organizaciones**.
- **KYC de staff** (verificación de cédula/credenciales).
- **Módulo de Marketing**: contenido **patrocinado** (radio configurable en km, planes
  semanal/quincenal/mensual, badge *"Patrocinado"*), **push general** y **push de comercio**.
- **Finanzas**: suscripciones, libro mayor, facturas, liquidaciones.
- Acceso: `superadmin@migo.com` (entorno de prueba).

---

## 4. Arquitectura general

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────┐   ┌──────────────┐
│  mobile-client   │   │   mobile-vet     │   │   web-vet    │   │  web-admin   │
│  (Expo / RN)     │   │   (Expo / RN)    │   │ (React/Vite) │   │ (React/Vite) │
└─────────┬────────┘   └─────────┬────────┘   └──────┬───────┘   └──────┬───────┘
          │                      │                    │                  │
          └──────────────────────┴─────── HTTPS ──────┴──────────────────┘
                                       │  REST /api/v1
                              ┌────────▼─────────┐
                              │   Backend API    │  Node + Express + TS
                              │  (Render, tsx)   │  Prisma ORM · JWT · Zod
                              └───┬───────┬───┬──┘
                    ┌─────────────┘       │   └──────────────┐
             ┌──────▼──────┐      ┌───────▼──────┐    ┌──────▼───────┐
             │  Supabase   │      │    Stream    │    │  FCM / Resend│
             │ PostgreSQL  │      │ chat + video │    │ push · email │
             └─────────────┘      └──────────────┘    └──────────────┘
```

- **Un solo backend** expone una API REST versionada en `/api/v1` que sirve a las 4 superficies.
- **PostgreSQL en Supabase** como base de datos (acceso vía Prisma).
- Servicios de terceros para **chat/video (Stream)**, **push (FCM)** y **email (Resend)**.

---

## 5. Stack tecnológico

### Backend
- **Node.js + Express 4.21** en **TypeScript**, ejecutado con **tsx** (dev y producción).
- **Prisma 5.22** (`@prisma/client`) sobre **PostgreSQL** (Supabase).
- **Zod** (validación), **JWT** (`jsonwebtoken`) + **bcryptjs** (auth), **helmet**, **cors**, **morgan**.
- **Stream** (`@stream-io/node-sdk`, `stream-chat`), **expo-server-sdk** (push FCM).

### Móvil (`mobile-client`, `mobile-vet`)
- **Expo ~57** · **React Native 0.86.2** · **React 19.2.3** · TypeScript.
- **React Navigation** (native-stack + bottom-tabs), **TanStack Query**.
- **Stream Video + Chat RN SDK** (`@stream-io/video-react-native-sdk`, `stream-chat-expo`) + **WebRTC**.
- **MapLibre** (`@maplibre/maplibre-react-native`) para mapas/emergencias.
- **Google Sign-In nativo** (`@react-native-google-signin/google-signin`).
- **expo-notifications** (push), **expo-print** + **expo-sharing** (PDF), **expo-location**,
  **expo-image-picker/manipulator**, **reanimated/worklets**, fuente **Outfit**.

### Web (`web-vet`, `web-admin`)
- **React 19 + Vite + TypeScript + TailwindCSS**, **React Router**.
- `web-vet` además: **Stream Video + Chat React SDK** para teleconsulta y chat.

---

## 6. Estructura del monorepo

```
C:\migo\
├── apps\
│   ├── mobile-client\     # App B2C (Expo/RN) — com.migo.client
│   ├── mobile-vet\        # App B2B (Expo/RN) — com.migo.vet
│   ├── web-vet\           # Panel clínica (React/Vite/Tailwind, :5173)
│   └── web-admin\         # Super Admin (React/Vite/Tailwind, :5174)
├── server\
│   ├── src\
│   │   ├── app.ts         # Express app + montaje de rutas /api/v1
│   │   ├── server.ts      # Arranque HTTP
│   │   └── modules\       # Un folder por dominio (ver §7)
│   └── prisma\
│       ├── schema.prisma  # 40 modelos (fuente de verdad del esquema)
│       ├── seed.ts        # Semillas
│       └── migrations\    # 0_init/migration.sql (generado con db:sql)
└── docs\
    └── DOCUMENTACION.md   # Este documento
```

> **Nota:** los folders `android/` de las apps móviles están **gitignored** — se regeneran con
> `expo prebuild`; la fuente de verdad de la config nativa es `app.json`.

---

## 7. Backend: módulos y API

La API se sirve bajo el prefijo **`/api/v1`** (`server/src/app.ts`). Middlewares globales:
`helmet`, `cors`, `express.json({ limit: '2mb' })`, `morgan` (solo en dev), y manejadores
`notFoundHandler` / `errorHandler`.

### Rutas montadas

| Ruta base | Módulo | Responsabilidad |
|---|---|---|
| `/api/v1/auth` | `auth` | Registro, login (email + Google), refresh tokens, reset de contraseña. |
| `/api/v1/dashboard` | `dashboard` | Datos agregados de inicio (cliente/vet). |
| `/api/v1/appointments` | `appointments` | Agendamiento y gestión de citas. |
| `/api/v1/emergencies` | `emergencies` | Emergencias, alertas y ruteo. |
| `/api/v1/patients` | `patients` | Mascotas y su historia clínica. |
| `/api/v1/staff` | `staff` | Staff de clínica, turnos, invitaciones. |
| `/api/v1/services` | `services` | Catálogo de servicios y su asignación a staff. |
| `/api/v1/clinic` | `clinic` | Perfil de la clínica, horarios, patrocinios. |
| `/api/v1/finance` | `finance` | Suscripciones, libro mayor, facturas, liquidaciones. |
| `/api/v1/me` | `me` | Perfil del usuario autenticado, `VetProfile`, recibos. |
| `/api/v1/clinics` | `clinics` (directory) | Directorio público de clínicas. |
| `/api/v1/admin` | `admin` | Operación Super Admin (usuarios, marketing, config). |
| `/api/v1/staff-kyc` | `staffKyc` | Verificación KYC de credenciales del staff. |

### Módulos de soporte (servicios internos, no montados como ruta top-level)

- **`chat` / `stream`** — integración con Stark/Stream: emisión de tokens, upsert de usuarios
  (⚠️ límite de 100 KB en `upsertUser`; las imágenes deben ser URLs `http(s)`, no base64),
  resúmenes de chat.
- **`push`** — envío de notificaciones vía `expo-server-sdk` (FCM V1).
- **`mail`** — correos transaccionales con **Resend** (bienvenida, reset de contraseña,
  confirmación de cita, recibo de factura). En modo test hasta verificar dominio.
- **`receipts`** — emisión de recibos/facturas (`receipt.service.issueReceipt`).

---

## 8. Modelo de datos

`server/prisma/schema.prisma` — **40 modelos** agrupados por dominio:

**Identidad y acceso**
`User`, `RefreshToken`, `PushToken`, `PasswordResetCode`, `StaffInvitation`, `StaffKyc`

**Configuración e IA**
`AiTriageRule`, `AiKnowledgeEntry`, `PlatformConfig`, `GroomingBreedInterval`

**Mascotas y expediente médico**
`Pet`, `Allergy`, `PetCondition`, `Vaccination`, `Prescription`, `MedicalRecord`
*(MedicalRecord incluye `signedAt` + snapshot `signedByName/License/Specialty` para firma persistente).*

**Clínicas, staff y catálogo**
`Organization`, `Clinic`, `ClinicSponsorship`, `ClinicHours`, `ClinicStaff`,
`VetProfile`, `VetSubscription`, `StaffShift`, `Service`, `ServiceStaff`

**Citas, emergencias y teleconsulta**
`Appointment`, `Emergency`, `EmergencyAlert`, `Teleconsult`

**Comunicación y reputación**
`ChatMessage`, `ChatSummary`, `Review`

**Finanzas**
`Subscription`, `LedgerEntry`, `Invoice`, `Receipt`, `Payout`, `SettlementAccount`

**Auditoría**
`AuditLog`

### Cambios de esquema (importante)

El **session pooler (puerto 5432)** de Supabase **rechaza el handshake**, por lo que
`prisma db push` / `migrate deploy` **no funcionan**. El esquema se cambia así:

1. Editar `schema.prisma`.
2. Aplicar el `ALTER/CREATE` puntual con `$executeRawUnsafe` sobre el **transaction pooler (6543)**
   (script temporal en node).
3. `npx prisma generate`.
4. `npm run db:sql` regenera `prisma/migrations/0_init/migration.sql`.

---

## 9. Servicios externos

| Servicio | Uso | Notas |
|---|---|---|
| **Supabase** | PostgreSQL | Cambios de esquema por transaction pooler `6543` (ver §8). |
| **Stream** | Chat + video (teleconsulta) | Límite 100 KB en `upsertUser`; imágenes como URL, no base64. |
| **Firebase Cloud Messaging (FCM V1)** | Push móvil | Proyecto `migo-f5b7c`; envío con `expo-server-sdk`. |
| **Resend** | Email transaccional | En modo test hasta verificar dominio propio (`MAIL_FROM`). |
| **Google OAuth** | Login con Google | Proyecto Cloud "green" `967962081340`; SDK nativo. |
| **Gemini** | Migo IA | `model=gemini-flash-latest`, `maxOutputTokens ~1200`. |

---

## 10. Entornos y despliegue

| Componente | Dónde | Detalle |
|---|---|---|
| **Backend API** | **Render** | `https://migo-api-n85p.onrender.com`; corre con **tsx** (no requiere `tsc` build). |
| **Base de datos** | **Supabase** | PostgreSQL gestionado. |
| **web-vet** | **Vercel** | Build con Vite. |
| **web-admin** | **Vercel** | Build con Vite. |
| **mobile-client / mobile-vet** | **Google Play** (en proceso) | AAB firmado; ver §12. |

**Variables de entorno** (`server/.env`, **gitignored**): cadena de conexión a Supabase, claves de
Stream, credenciales FCM, API key de Resend, secreto JWT, config de Google/Gemini. Los secretos de
firma y llaves viven en `C:\Users\PC\Documents\migo-secrets\` (**fuera del repo**).

> Actualizar **plan de Render** o **verificar el dominio de email** **no** requiere recompilar las
> apps móviles.

---

## 11. Cómo correr el proyecto en local

**Requisitos:** Node.js, npm. Para builds Android: JDK 17 y Android SDK (ver §12).

### Backend
```bash
cd C:\migo\server
npm install
npx prisma generate
npm run dev        # tsx watch src/server.ts
```
Scripts útiles (`server/package.json`): `db:sql`, `db:apply`, `db:seed`, `db:reset-user`, `typecheck`.

### Web (clínica / admin)
```bash
cd C:\migo\apps\web-vet     # o web-admin
npm install
npm run dev                 # Vite (web-vet :5173, web-admin :5174)
```

### Móvil
```bash
cd C:\migo\apps\mobile-client   # o mobile-vet
npm install
npx expo start
```
> ⚠️ Las apps **ya no corren en Expo Go**: los módulos nativos de GetStream (video) requieren un
> **Dev Build** de Expo (o correr el APK/AAB nativo).

---

## 12. Build y publicación móvil (Android)

**Toolchain** (ver scripts en `scratchpad`):
- **JDK 17**: `C:\Users\PC\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2`
- **Android SDK**: `C:\Users\PC\AppData\Local\Android\Sdk`
- `NODE_ENV=production`, build con `gradlew` (`clean` + `bundleRelease` para AAB / `assembleRelease` para APK).

**Identidad de las apps:** `com.migo.client` (Migo Cliente) · `com.migo.vet` (Migo Vet).
`versionCode 1`, `versionName "1.0.0"`.

**Firma de release** (`android/app/build.gradle`, gitignored):
`signingConfigs.release` lee `C:/Users/PC/Documents/migo-secrets/keystore.properties`; si el archivo
existe el `buildTypes.release` usa la keystore de release, si no cae a `debug`.

- Keystores (fuera del repo, **respaldar**): `migo-client-release.keystore` (alias `migo-client`),
  `migo-vet-release.keystore` (alias `migo-vet`).
- ⚠️ **Si se pierde la keystore no se puede volver a actualizar la app en la Play Store.**

**Artefactos:** AABs firmados en `C:\Users\PC\Documents\migo-aab\` (`Migo-Cliente.aab` ~114 MB,
`Migo-Vet.aab`), verificados con `keytool -printcert -jarfile`.

**Publicación (Play Console):** cuenta tipo **Personal** (dueña `mobresu@gmail.com`). Flujo:
1. Subir ambos AAB a **Pruebas Internas** (no requiere dominio ni política de privacidad).
2. **Play App Signing:** Google re-firma → hay que agregar el **SHA-1 de App Signing** (que da Play
   Console) a los OAuth clients Android para que el **login con Google** funcione en la build de la tienda.
3. Para **producción pública**: dominio + política de privacidad + home hosteadas, publicar el consent
   screen OAuth a producción, ficha de tienda (capturas, gráfico destacado, icono 512, data safety,
   content rating). **Cuenta Personal nueva:** Google exige **prueba cerrada con ≥20 testers por 14 días**.

---

## 13. Convenciones y notas de operación

- **`android/` es gitignored** en ambas apps móviles → cambios nativos van en `app.json` (regenerado
  por `expo prebuild`).
- **`.env` y `migo-secrets/` fuera del control de versiones**; las contraseñas de keystore no se
  guardan en repos ni notas de memoria.
- **Fuente Outfit** aplicada globalmente redefiniendo los getters de `Text`/`TextInput` (RN 0.86);
  tokens tipográficos en el theme.
- **Chat con Stream:** nunca enviar imágenes en base64 a `upsertUser` (límite 100 KB) — usar URL.
- **Commits:** terminan con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 14. Roadmap y pendientes

**En proceso**
- Publicación en Google Play (cuenta Personal + subida a Pruebas Internas).
- Dominio propio → política de privacidad + home → email en producción (`MAIL_FROM`).

**Épico "Veterinario independiente"** (3 fases)
- **Fase A** — fundaciones (`VetProfile` + `VetSubscription`): ✅.
- **Fase B** — escaneo de carnet/credencial del vet: pendiente.
- **Fase C** — ruteo de emergencias por IA (especialidad + radio): pendiente.
- Pendiente resto de Fase A: home de vet independiente en la app, endpoint de telemedicina,
  sincronización de verificación KYC en el admin.

**Escalamiento**
- Upgrade de plan de Render/Supabase al crecer la base de usuarios (sin recompilar apps).

**Próximo (fuera de esta doc)**
- **Sitio web de Migo** (landing) — a construir.

---

*Documento vivo — actualízalo cuando cambien módulos, esquema o el flujo de despliegue.*
