import { EventEmitter } from 'node:events';

/**
 * Bus de eventos en memoria para push en tiempo real (SSE).
 * El flujo de emergencia publica aquí; cada conexión SSE de una clínica
 * escucha y reenvía lo que le corresponde.
 *
 * Nota de escala: esto vive en la memoria de UNA instancia. En Cloud Run con
 * varias instancias, migrar a un pub/sub compartido (Redis / Cloud Pub/Sub).
 */
export const bus = new EventEmitter();
bus.setMaxListeners(0); // sin límite: habrá muchas conexiones SSE

export interface EmergencyEvent {
  clinicId: string;
  emergencyId: string;
}

export const EMERGENCY_NEW = 'emergency:new';
