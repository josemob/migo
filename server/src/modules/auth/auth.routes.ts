import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import { docDataUri } from '../../utils/docDataUri';
import { authService } from './auth.service';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  nationalId: z.string().optional(),
  // el registro público solo permite dueños; el staff se crea por invitación
  role: z.enum(['PET_OWNER']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const googleSchema = z.object({ idToken: z.string().min(1) });

router.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, req.headers['user-agent']);
    res.status(201).json(result);
  }),
);

const clinicSignupSchema = z.object({
  fullName: z.string().trim().min(3, 'Escribe tu nombre completo'),
  email: z.string().trim().email('Correo no válido'),
  password: z.string().min(8, 'La contraseña debe tener mínimo 8 caracteres'),
  phone: z.string().trim().min(7, 'Escribe un teléfono de contacto'),
  nationalId: z.string().trim().optional(),
  orgName: z.string().trim().min(2, 'Escribe el nombre comercial'),
  legalName: z.string().trim().optional(),
  rif: z.string().trim().min(9, 'Escribe el RIF'),
  rifDocUrl: docDataUri,
  sanitaryPermitUrl: docDataUri.optional(),
  clinicName: z.string().trim().min(2, 'Escribe el nombre de la sede'),
  clinicPhone: z.string().trim().optional(),
  address: z.string().trim().min(5, 'Escribe la dirección'),
  city: z.string().trim().min(2, 'Escribe la ciudad'),
  state: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isOpen24_7: z.boolean().default(false),
  acceptsEmergencies: z.boolean().default(true),
});

// POST /auth/register-clinic -> autoregistro de clínica (queda en revisión del Super Admin)
router.post(
  '/register-clinic',
  rateLimit({ windowMs: 60 * 60_000, max: 10 }),
  validate({ body: clinicSignupSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.registerClinic(req.body, req.headers['user-agent']);
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password, req.headers['user-agent']);
    res.json(result);
  }),
);

router.post(
  '/google',
  validate({ body: googleSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.googleAuth(req.body.idToken, req.headers['user-agent']);
    res.json(result);
  }),
);

router.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authService.refresh(req.body.refreshToken));
  }),
);

router.post(
  '/logout',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await authService.me(req.user!.id));
  }),
);

// Cambio de contraseña estando logueado (contraseña actual → nueva)
router.post(
  '/change-password',
  authenticate,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Mínimo 8 caracteres') }) }),
  asyncHandler(async (req, res) => {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true });
  }),
);

// Recuperación de contraseña por código enviado al correo
router.post(
  '/forgot-password',
  validate({ body: z.object({ email: z.string().email() }) }),
  asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body.email);
    // Respuesta genérica: no revela si el correo existe.
    res.json({ ok: true });
  }),
);

router.post(
  '/reset-password',
  validate({ body: z.object({ email: z.string().email(), code: z.string().length(6), newPassword: z.string().min(6) }) }),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword);
    res.json({ ok: true });
  }),
);

export default router;
