import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import appointmentsRoutes from './modules/appointments/appointments.routes';
import emergenciesRoutes from './modules/emergencies/emergencies.routes';
import patientsRoutes from './modules/patients/patients.routes';
import staffRoutes from './modules/staff/staff.routes';
import servicesRoutes from './modules/services/services.routes';
import clinicRoutes from './modules/clinic/clinic.routes';
import financeRoutes from './modules/finance/finance.routes';
import meRoutes from './modules/me/me.routes';
import directoryRoutes from './modules/clinics/directory.routes';
import adminRoutes from './modules/admin/admin.routes';
import staffKycRoutes from './modules/staffKyc/staffKyc.routes';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
if (!env.isProd) app.use(morgan('dev'));

// Health check (Cloud Run)
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'migo-api' }));

// API v1
const api = express.Router();
api.use('/auth', authRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/appointments', appointmentsRoutes);
api.use('/emergencies', emergenciesRoutes);
api.use('/patients', patientsRoutes);
api.use('/staff', staffRoutes);
api.use('/services', servicesRoutes);
api.use('/clinic', clinicRoutes);
api.use('/finance', financeRoutes);
// App Cliente (B2C)
api.use('/me', meRoutes);
api.use('/clinics', directoryRoutes);
// Super Admin (MIGO Sistema Operativo)
api.use('/admin', adminRoutes);
// Onboarding/KYC del personal de clínica (app Vet)
api.use('/staff-kyc', staffKycRoutes);
app.use('/api/v1', api);

app.use(notFoundHandler);
app.use(errorHandler);
