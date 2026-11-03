import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';
import { hashPassword } from '../../utils/password';
import { sendPush } from '../push/push.service';

const router = Router();
router.use(authenticate, withClinicContext);

const POSITIONS = ['VET', 'GROOMER', 'SUPPORT', 'RECEPTIONIST', 'BRANCH_ADMIN'] as const;
const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY', 'OFF'] as const;

const staffInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
} as const;

// GET /staff  -> "Personal Activo en Sucursal" + capacidad
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.clinicId! },
      select: { staffCapacity: true },
    });
    const staff = await prisma.clinicStaff.findMany({
      where: { clinicId: req.clinicId! },
      include: staffInclude,
      orderBy: { createdAt: 'asc' },
    });
    const activeCount = staff.filter((s) => s.isActive).length;
    res.json({
      data: staff,
      capacity: { used: activeCount, total: clinic?.staffCapacity ?? 0 },
    });
  }),
);

// GET /staff/shifts/today -> "Guardias & Especialistas Hoy"
router.get(
  '/shifts/today',
  asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shifts = await prisma.staffShift.findMany({
      where: { date: today, staff: { clinicId: req.clinicId! } },
      include: { staff: { include: staffInclude } },
      orderBy: { shift: 'asc' },
    });
    res.json({ date: today, data: shifts });
  }),
);

// POST /staff/validate-cmv -> "VALIDAR CON REGISTRO CMV"
// Placeholder de integración con el padrón del Colegio de Médicos Veterinarios.
router.post(
  '/validate-cmv',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: z.object({ nationalId: z.string().min(4) }) }),
  asyncHandler(async (req, res) => {
    // TODO: integrar con el registro CMV real. Por ahora respondemos "no encontrado"
    // para que el frontend maneje el flujo manual de verificación.
    res.json({
      found: false,
      nationalId: req.body.nationalId,
      message: 'Validación automática CMV aún no integrada. Verificación manual requerida.',
    });
  }),
);

// POST /staff -> "Invitar Personal" (crea usuario + perfil de staff)
const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  nationalId: z.string().optional(),
  position: z.enum(POSITIONS),
  roleLabel: z.string().optional(),
  specialty: z.string().optional(),
  cmvLicense: z.string().optional(),
  collegiateNumber: z.string().optional(),
  tempPassword: z.string().min(8),
});

router.post(
  '/',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: inviteSchema }),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.clinicId! },
      select: { staffCapacity: true },
    });
    const activeCount = await prisma.clinicStaff.count({
      where: { clinicId: req.clinicId!, isActive: true },
    });
    if (clinic && activeCount >= clinic.staffCapacity) {
      throw ApiError.conflict(
        `Capacidad de staff alcanzada (${activeCount}/${clinic.staffCapacity}). Mejora tu plan para agregar más personal.`,
      );
    }

    const isVet = req.body.position === 'VET';
    const globalRole = req.body.position === 'BRANCH_ADMIN' ? 'CLINIC_ADMIN' : isVet ? 'VET' : 'VET';

    const staff = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: req.body.email },
        include: { staffProfile: true },
      });
      if (existing?.staffProfile) throw ApiError.conflict('Ese usuario ya pertenece a una sucursal');

      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: req.body.email,
            fullName: req.body.fullName,
            phone: req.body.phone,
            nationalId: req.body.nationalId,
            passwordHash: await hashPassword(req.body.tempPassword),
            role: globalRole as never,
          },
        }));

      return tx.clinicStaff.create({
        data: {
          userId: user.id,
          clinicId: req.clinicId!,
          position: req.body.position,
          roleLabel: req.body.roleLabel,
          specialty: req.body.specialty,
          cmvLicense: req.body.cmvLicense,
          collegiateNumber: req.body.collegiateNumber,
          // los VET arrancan PENDING hasta verificar CMV; el resto no aplica
          verificationStatus: isVet ? 'PENDING' : 'VERIFIED',
        },
        include: staffInclude,
      });
    });

    res.status(201).json(staff);
  }),
);

// GET /staff/search?q= -> buscar profesionales VERIFICADOS (KYC aprobado) por cédula/correo/nombre
router.get(
  '/search',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ query: z.object({ q: z.string().min(2) }) }),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string).trim();
    const kycs = await prisma.staffKyc.findMany({
      where: {
        status: 'APPROVED',
        user: {
          OR: [
            { nationalId: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      include: { user: { select: { id: true, fullName: true, email: true, nationalId: true, staffProfile: { select: { id: true } } } } },
      take: 10,
    });
    const invited = await prisma.staffInvitation.findMany({ where: { clinicId: req.clinicId!, status: 'PENDING' }, select: { userId: true } });
    const invitedSet = new Set(invited.map((i) => i.userId));
    const data = kycs.map((k) => ({
      userId: k.userId,
      fullName: k.user.fullName,
      email: k.user.email,
      nationalId: k.user.nationalId,
      position: k.requestedPosition,
      specialty: k.specialty,
      collegiateNumber: k.collegiateNumber,
      alreadyStaff: !!k.user.staffProfile,
      alreadyInvited: invitedSet.has(k.userId),
    }));
    res.json({ data });
  }),
);

// POST /staff/invite -> invitar a un profesional verificado (le llega push; él acepta/rechaza)
router.post(
  '/invite',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: z.object({ userId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const kyc = await prisma.staffKyc.findUnique({
      where: { userId: req.body.userId },
      include: { user: { select: { staffProfile: { select: { id: true } } } } },
    });
    if (!kyc || kyc.status !== 'APPROVED') throw ApiError.badRequest('El profesional no está verificado.');
    if (kyc.user.staffProfile) throw ApiError.conflict('Ese profesional ya pertenece a una sucursal.');
    const dup = await prisma.staffInvitation.findFirst({ where: { clinicId: req.clinicId!, userId: req.body.userId, status: 'PENDING' } });
    if (dup) throw ApiError.conflict('Ya invitaste a este profesional.');

    const clinic = await prisma.clinic.findUnique({ where: { id: req.clinicId! }, select: { name: true } });
    const inv = await prisma.staffInvitation.create({
      data: { clinicId: req.clinicId!, userId: req.body.userId, position: kyc.requestedPosition, invitedById: req.user!.id },
    });
    void sendPush(req.body.userId, {
      title: 'Invitación de equipo 🩺',
      body: `${clinic?.name ?? 'Una clínica'} quiere que formes parte de su equipo.`,
      data: { type: 'staff_invite', invitationId: inv.id },
    }).catch(() => {});
    res.status(201).json({ id: inv.id, status: inv.status });
  }),
);

// PATCH /staff/:id -> "Editar Rol" / activar-desactivar / verificar CMV
const updateSchema = z.object({
  position: z.enum(POSITIONS).optional(),
  roleLabel: z.string().optional(),
  specialty: z.string().optional(),
  experienceYears: z.number().int().min(0).max(80).nullable().optional(),
  cmvLicense: z.string().optional(),
  collegiateNumber: z.string().optional(),
  isActive: z.boolean().optional(),
  verificationStatus: z.enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED']).optional(),
});

router.patch(
  '/:id',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ params: z.object({ id: z.string().uuid() }), body: updateSchema }),
  asyncHandler(async (req, res) => {
    const staff = await prisma.clinicStaff.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
    });
    if (!staff) throw ApiError.notFound('Miembro del staff no encontrado');

    const data = { ...req.body } as typeof req.body & { verifiedAt?: Date };
    if (req.body.verificationStatus === 'VERIFIED') data.verifiedAt = new Date();

    const updated = await prisma.clinicStaff.update({
      where: { id: staff.id },
      data,
      include: staffInclude,
    });
    res.json(updated);
  }),
);

// DELETE /staff/:id -> quitar a alguien del equipo de la sucursal. Borra su ClinicStaff, así
// queda libre para unirse a otra clínica o trabajar como independiente y libera un cupo.
// El historial se conserva: los informes guardan el snapshot del firmante y las citas,
// vacunas y récipes quedan sin vet asignado (relaciones opcionales). Las guardias se borran.
router.delete(
  '/:id',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const staff = await prisma.clinicStaff.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
      include: {
        user: { select: { id: true, role: true } },
        clinic: { select: { name: true, organization: { select: { ownerId: true } } } },
      },
    });
    if (!staff) throw ApiError.notFound('Miembro del staff no encontrado');
    if (staff.userId === req.user!.id) throw ApiError.badRequest('No puedes quitarte a ti mismo del equipo.');
    if (staff.userId === staff.clinic.organization.ownerId) {
      throw ApiError.badRequest('No se puede quitar al dueño de la clínica.');
    }

    await prisma.$transaction([
      prisma.clinicStaff.delete({ where: { id: staff.id } }),
      // Un admin de sucursal que sale del equipo no conserva permisos de administrador.
      ...(staff.user.role === 'CLINIC_ADMIN'
        ? [prisma.user.update({ where: { id: staff.userId }, data: { role: 'VET' } })]
        : []),
    ]);

    void sendPush(staff.userId, {
      title: 'Ya no formas parte del equipo',
      body: `${staff.clinic.name} te quitó de su equipo en Migo.`,
      data: { type: 'staff_removed' },
    }).catch(() => {});

    res.status(204).end();
  }),
);

// PUT /staff/:id/shift -> asignar guardia del día
router.put(
  '/:id/shift',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      date: z.coerce.date(),
      shift: z.enum(SHIFTS),
      isOnCall: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const staff = await prisma.clinicStaff.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
    });
    if (!staff) throw ApiError.notFound('Miembro del staff no encontrado');

    const date = new Date(req.body.date);
    date.setHours(0, 0, 0, 0);
    const shift = await prisma.staffShift.upsert({
      where: { staffId_date_shift: { staffId: staff.id, date, shift: req.body.shift } },
      create: { staffId: staff.id, date, shift: req.body.shift, isOnCall: req.body.isOnCall },
      update: { isOnCall: req.body.isOnCall },
    });
    res.json(shift);
  }),
);

export default router;
