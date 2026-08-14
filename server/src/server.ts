import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { expireStaleEmergencies } from './modules/emergencies/emergency.service';
import { resetExpiredUnavailability } from './modules/clinics/availability.service';

const server = app.listen(env.PORT, () => {
  console.log(`🐾 Migo API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Barrido periódico: cierra las urgencias que nadie aceptó pasados 20 min.
// Corre cada minuto aunque no haya nadie consultando (autoridad del auto-cierre).
const emergencySweep = setInterval(() => {
  expireStaleEmergencies()
    .then((n) => {
      if (n > 0) console.log(`[emergencies] ${n} urgencia(s) sin atención cerradas por tiempo`);
    })
    .catch((e) => console.error('[emergencies] barrido falló', e instanceof Error ? e.message : e));
}, 60_000);
emergencySweep.unref?.(); // no impide que el proceso termine

// Barrido periódico: restaura la disponibilidad de clínicas cuyo cierre manual ya venció
// (se reabren solas al iniciar el día siguiente en hora de Venezuela).
const availabilitySweep = setInterval(() => {
  resetExpiredUnavailability()
    .then((n) => {
      if (n > 0) console.log(`[clinics] ${n} clínica(s) reabiertas automáticamente`);
    })
    .catch((e) => console.error('[clinics] barrido disponibilidad falló', e instanceof Error ? e.message : e));
}, 60_000);
availabilitySweep.unref?.();

const shutdown = async (signal: string) => {
  console.log(`\n${signal} recibido, cerrando...`);
  clearInterval(emergencySweep);
  clearInterval(availabilitySweep);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Resiliencia ante blips del pooler de Supabase (red inestable): loguear en vez de
// morir. Los errores de request ya los maneja el middleware (500); esto evita que un
// rejection asíncrono de Prisma (P1001) tumbe todo el proceso y haga falta reiniciar.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err instanceof Error ? err.message : err);
});
