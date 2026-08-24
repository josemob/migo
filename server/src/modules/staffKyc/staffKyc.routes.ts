import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { matchFaces } from './faceMatch.service';

const router = Router();
router.use(authenticate);

const POSITIONS = ['VET', 'GROOMER', 'SUPPORT', 'RECEPTIONIST', 'BRANCH_ADMIN'] as const;

// GET /staff-kyc/me -> estado del onboarding del usuario logueado (para la pantalla de "en revisión")
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const [kyc, staff] = await Promise.all([
      prisma.staffKyc.findUnique({ where: { userId: req.user!.id } }),
      prisma.clinicStaff.findUnique({ where: { userId: req.user!.id }, select: { id: true, clinicId: true } }),
    ]);
    res.json({ kyc, hasClinic: !!staff });
  }),
);

// POST /staff-kyc -> el staff envía su KYC (rol + selfie + cédula + carnet CMV si es vet)
router.post(
  '/',
  validate({
    body: z.object({
      requestedPosition: z.enum(POSITIONS),
      roleLabel: z.string().optional(),
      nationalId: z.string().min(3), // cédula: llave con la que la clínica lo adopta
      selfieUrl: z.string().min(1),
      idDocumentUrl: z.string().min(1),
      cmvCardUrl: z.string().optional(),
      collegiateNumber: z.string().optional(),
      specialty: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { nationalId, ...kyc } = req.body as {
      nationalId: string;
      requestedPosition: (typeof POSITIONS)[number];
      roleLabel?: string;
      selfieUrl: string;
      idDocumentUrl: string;
      cmvCardUrl?: string;
      collegiateNumber?: string;
      specialty?: string;
    };

    // La cédula queda en el usuario (por ahí lo encuentra la clínica para adoptarlo)
    await prisma.user.update({ where: { id: req.user!.id }, data: { nationalId } }).catch(() => {});

    // Face-match automático (si el motor está disponible); si no, va a revisión manual
    const match = await matchFaces(kyc.selfieUrl, kyc.idDocumentUrl);
    const passed = match ? match.passed : null;
    const status: 'APPROVED' | 'UNDER_REVIEW' = passed === true ? 'APPROVED' : 'UNDER_REVIEW';

    const data = { ...kyc, faceMatchScore: match?.score ?? null, faceMatchPassed: passed, status };
    const saved = await prisma.staffKyc.upsert({
      where: { userId: req.user!.id },
      update: { ...data, reviewNotes: null, reviewedById: null, reviewedAt: null },
      create: { userId: req.user!.id, ...data },
    });

    // Perfil profesional INDEPENDIENTE + suscripción de telemedicina (gratis). Existe
    // aunque el vet no pertenezca a ninguna clínica; se verifica al aprobar el KYC.
    const verified = status === 'APPROVED';
    await prisma.vetProfile
      .upsert({
        where: { userId: req.user!.id },
        create: {
          userId: req.user!.id,
          position: kyc.requestedPosition,
          specialty: kyc.specialty ?? null,
          collegiateNumber: kyc.collegiateNumber ?? null,
          verificationStatus: verified ? 'VERIFIED' : 'PENDING',
          verifiedAt: verified ? new Date() : null,
        },
        update: {
          position: kyc.requestedPosition,
          specialty: kyc.specialty ?? undefined,
          collegiateNumber: kyc.collegiateNumber ?? undefined,
          verificationStatus: verified ? 'VERIFIED' : 'PENDING',
          verifiedAt: verified ? new Date() : undefined,
        },
      })
      .catch(() => {});
    await prisma.vetSubscription
      .upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, plan: 'FREE', status: 'ACTIVE' }, update: {} })
      .catch(() => {});

    res.status(201).json(saved);
  }),
);

// GET /staff-kyc/invitations -> invitaciones de clínicas pendientes para el usuario
router.get(
  '/invitations',
  asyncHandler(async (req, res) => {
    const invs = await prisma.staffInvitation.findMany({
      where: { userId: req.user!.id, status: 'PENDING' },
      include: { clinic: { select: { name: true, city: true, logoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: invs });
  }),
);

// POST /staff-kyc/invitations/:id/respond -> aceptar (crea ClinicStaff) o rechazar
router.post(
  '/invitations/:id/respond',
  validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ accept: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const inv = await prisma.staffInvitation.findFirst({ where: { id: req.params.id, userId: req.user!.id, status: 'PENDING' } });
    if (!inv) throw ApiError.notFound('Invitación no encontrada');

    if (!req.body.accept) {
      await prisma.staffInvitation.update({ where: { id: inv.id }, data: { status: 'REJECTED', respondedAt: new Date() } });
      return res.json({ status: 'REJECTED' });
    }

    const existing = await prisma.clinicStaff.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (existing) throw ApiError.conflict('Ya perteneces a una sucursal.');
    const kyc = await prisma.staffKyc.findUnique({ where: { userId: req.user!.id } });

    await prisma.$transaction([
      prisma.clinicStaff.create({
        data: {
          userId: req.user!.id,
          clinicId: inv.clinicId,
          position: inv.position,
          specialty: kyc?.specialty ?? undefined,
          collegiateNumber: kyc?.collegiateNumber ?? undefined,
          cmvLicense: kyc?.cmvCardUrl ? 'ADJUNTO' : undefined,
          verificationStatus: 'VERIFIED',
        },
      }),
      // el rol global se alinea al puesto (como en "Invitar Personal")
      prisma.user.update({ where: { id: req.user!.id }, data: { role: inv.position === 'BRANCH_ADMIN' ? 'CLINIC_ADMIN' : 'VET' } }),
      prisma.staffInvitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } }),
      prisma.staffInvitation.updateMany({ where: { userId: req.user!.id, status: 'PENDING', id: { not: inv.id } }, data: { status: 'CANCELLED' } }),
    ]);
    res.json({ status: 'ACCEPTED', clinicId: inv.clinicId });
  }),
);

export default router;
