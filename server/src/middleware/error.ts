import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: { message: 'Ruta no encontrada' } });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { message: err.message, details: err.details ?? undefined },
    });
  }

  // Known Prisma errors -> friendly responses
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      return res.status(409).json({
        error: { message: `Ya existe un registro con ${target ?? 'ese valor'}` },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Recurso no encontrado' } });
    }
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Error interno del servidor',
      ...(env.isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
};
