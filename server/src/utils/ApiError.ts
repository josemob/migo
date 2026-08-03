/** Application error with an HTTP status code and optional details. */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'No autenticado') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'No autorizado') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Recurso no encontrado') {
    return new ApiError(404, message);
  }
  static conflict(message = 'Conflicto', details?: unknown) {
    return new ApiError(409, message, details);
  }
}
