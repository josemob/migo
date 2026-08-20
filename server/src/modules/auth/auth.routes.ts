import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
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
