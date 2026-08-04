import { StreamChat } from 'stream-chat';
import { StreamClient } from '@stream-io/node-sdk';
import { env } from '../../config/env';

let client: StreamChat | null = null;
let videoClient: StreamClient | null = null;

export type MigoStreamRole = 'customer' | 'vet';

/** La clínica se representa en Stream como un usuario "marca" (todo el staff opera bajo esta identidad). */
export const clinicStreamUserId = (clinicId: string) => `clinic_${clinicId}`;

export function streamConfigured(): boolean {
  return !!(env.STREAM_API_KEY && env.STREAM_API_SECRET);
}

/** Cliente server-side de Stream (firma tokens con el API Secret). Singleton. */
export function getStreamClient(): StreamChat {
  if (!streamConfigured()) throw new Error('GetStream no está configurado (STREAM_API_KEY / STREAM_API_SECRET).');
  if (!client) client = StreamChat.getInstance(env.STREAM_API_KEY!, env.STREAM_API_SECRET!);
  return client;
}

interface StreamUser {
  id: string;
  name?: string | null;
  image?: string | null;
  migoRole: MigoStreamRole;
}

/**
 * Registra/actualiza al usuario en Stream. El rol de negocio de Migo viaja como
 * campo custom `migo_role`; el permiso real para CREAR llamadas se controla en el
 * backend (solo el endpoint del Vet Dashboard crea teleconsultas), no en el cliente.
 */
export async function ensureStreamUser(u: StreamUser): Promise<void> {
  await getStreamClient().upsertUser({
    id: u.id,
    name: u.name ?? undefined,
    image: u.image ?? undefined,
    role: 'user',
    // @ts-expect-error campo custom permitido por Stream
    migo_role: u.migoRole,
  });
}

/** Hace upsert del usuario con su rol y devuelve las credenciales para el SDK cliente. */
export async function createStreamCredentials(
  u: StreamUser,
): Promise<{ apiKey: string; token: string; userId: string; role: MigoStreamRole }> {
  await ensureStreamUser(u);
  const token = getStreamClient().createToken(u.id);
  return { apiKey: env.STREAM_API_KEY!, token, userId: u.id, role: u.migoRole };
}

interface ClinicRef {
  id: string;
  name: string;
  logoUrl?: string | null;
}

/**
 * Asegura (idempotente) el canal de chat dueño↔clínica. Crea/actualiza ambos
 * usuarios de Stream (dueño real + identidad de la clínica) y un canal "distinct"
 * de tipo messaging con ambos como miembros.
 */
export async function ensureChatChannel(params: {
  owner: { id: string; name?: string | null; image?: string | null };
  clinic: ClinicRef;
}): Promise<{ type: string; id: string; cid: string }> {
  const c = getStreamClient();
  const clinicUserId = clinicStreamUserId(params.clinic.id);

  await c.upsertUsers([
    { id: params.owner.id, name: params.owner.name ?? undefined, image: params.owner.image ?? undefined, role: 'user', migo_role: 'customer' },
    { id: clinicUserId, name: params.clinic.name, image: params.clinic.logoUrl ?? undefined, role: 'user', migo_role: 'vet' },
  ] as never);

  const channel = c.channel('messaging', undefined, {
    members: [params.owner.id, clinicUserId],
    created_by_id: clinicUserId,
    name: params.clinic.name,
    image: params.clinic.logoUrl ?? undefined,
    migo_clinic_id: params.clinic.id,
    migo_owner_id: params.owner.id,
  } as never);
  const created = await channel.create();

  // Canal nuevo (sin mensajes): la clínica saluda para que el cliente vea la conversación
  // iniciada e invite a responder/escribir.
  const msgs = (created as { messages?: unknown[] }).messages;
  if (!msgs || msgs.length === 0) {
    await channel.sendMessage({
      text: `¡Hola! 👋 Bienvenido al chat de ${params.clinic.name}. Cuéntanos, ¿en qué podemos ayudarte con tu mascota?`,
      user_id: clinicUserId,
    });
  }

  return { type: 'messaging', id: channel.id!, cid: channel.cid };
}

/** Cliente de video server-side (node-sdk). Singleton. */
export function getVideoClient(): StreamClient {
  if (!streamConfigured()) throw new Error('GetStream no está configurado.');
  if (!videoClient) videoClient = new StreamClient(env.STREAM_API_KEY!, env.STREAM_API_SECRET!);
  return videoClient;
}

/**
 * Crea una sala de teleconsulta y "anilla" (ring) al dueño. Solo la clínica puede
 * llamar a esta función (se invoca desde un endpoint autenticado del Vet Dashboard).
 */
export async function createRingingCall(params: {
  callId: string;
  clinic: ClinicRef;
  ownerId: string;
  video: boolean;
}): Promise<{ callType: string; callId: string; cid: string; createdBy: string }> {
  const clinicUserId = clinicStreamUserId(params.clinic.id);
  await getStreamClient().upsertUser({
    id: clinicUserId,
    name: params.clinic.name,
    image: params.clinic.logoUrl ?? undefined,
    role: 'user',
    migo_role: 'vet',
  } as never);

  const call = getVideoClient().video.call('default', params.callId);
  await call.getOrCreate({
    ring: true,
    data: {
      created_by_id: clinicUserId,
      members: [{ user_id: clinicUserId }, { user_id: params.ownerId }],
      custom: { migo_clinic_id: params.clinic.id, video: params.video },
    },
  });

  return { callType: 'default', callId: params.callId, cid: `default:${params.callId}`, createdBy: clinicUserId };
}
