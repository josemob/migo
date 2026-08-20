import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // Client IDs de Google OAuth (Web + Android cliente + Android vet), separados por coma.
  // Se aceptan todos como `aud` válido del ID token que envían las apps.
  GOOGLE_CLIENT_IDS: z.string().optional(),
  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),

  // GetStream (Chat + Video). El Secret solo vive en el servidor.
  STREAM_API_KEY: z.string().optional(),
  STREAM_API_SECRET: z.string().optional(),

  CPL_FEE_USD: z.coerce.number().default(5),
  BOOKING_COMMISSION_RATE: z.coerce.number().default(0.09),

  // Correo transaccional (Resend). En modo test el remitente es onboarding@resend.dev.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Migo <onboarding@resend.dev>'),
  // URL pública del panel/app para enlaces dentro de los correos (si aplica).
  APP_PUBLIC_URL: z.string().default('https://holamigo.app'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  googleClientIds: (parsed.data.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};
