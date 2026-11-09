-- Asigna destino a los avisos guardados antes de la columna "app" (solo los que no la tienen).
UPDATE "Notification" SET "app" = 'vet' WHERE "app" IS NULL AND "type" IN ('emergency', 'appointment-request', 'staff_invite', 'staff_removed');
UPDATE "Notification" SET "app" = 'vet' WHERE "app" IS NULL AND "type" = 'appointment' AND "title" = 'Cita cancelada por el dueño';
UPDATE "Notification" SET "app" = 'client' WHERE "app" IS NULL AND "type" IN ('appointment', 'PET_FOUND');
