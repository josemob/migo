import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';

const router = Router();
router.use(authenticate, withClinicContext);

// GET /dashboard/summary -> "Panel de Control"
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const weekStart = new Date(dayStart.getTime() - 7 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [appointmentsToday, newPetsWeek, triageMonth, staffActive, staffTotal, activeAlert, schedule, recentRecords] =
      await Promise.all([
        prisma.appointment.count({
          where: { clinicId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
        }),
        prisma.pet.count({
          where: { createdAt: { gte: weekStart }, appointments: { some: { clinicId } } },
        }),
        prisma.emergency.count({
          where: { acceptedClinicId: clinicId, attendedAt: { gte: monthStart }, status: { in: ['ATTENDED', 'HOSPITALIZED'] } },
        }),
        prisma.clinicStaff.count({ where: { clinicId, isActive: true, position: 'VET' } }),
        prisma.clinic.findUnique({ where: { id: clinicId }, select: { staffCapacity: true } }),
        prisma.emergencyAlert.findFirst({
          where: { clinicId, status: { in: ['SENT', 'SEEN', 'ACCEPTED'] }, emergency: { status: { in: ['BROADCASTING', 'ACCEPTED', 'EN_ROUTE'] } } },
          include: {
            emergency: {
              include: {
                pet: { select: { name: true, breed: true, species: true, weightKg: true } },
                owner: { select: { fullName: true, phone: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.appointment.findMany({
          where: { clinicId, scheduledAt: { gte: dayStart, lt: dayEnd } },
          include: {
            pet: { select: { name: true, breed: true, owner: { select: { fullName: true } } } },
            service: { select: { name: true, category: true } },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 8,
        }),
        prisma.medicalRecord.findMany({
          where: { clinicId },
          include: { pet: { select: { name: true, breed: true } } },
          orderBy: { visitedAt: 'desc' },
          take: 5,
        }),
      ]);

    res.json({
      stats: {
        appointmentsToday,
        newPetsThisWeek: newPetsWeek,
        triageAttendedThisMonth: triageMonth,
        staff: { active: staffActive, capacity: staffTotal?.staffCapacity ?? 0 },
      },
      activeAlert,
      schedule,
      recentRecords,
    });
  }),
);

export default router;
