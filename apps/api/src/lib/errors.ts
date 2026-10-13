// Error responses (docs/contract.md §1.4). Throw an AppError from a handler or hook; the error
// handler below turns it, and every other error, into `{ error: { code, message, details? } }`.
import { ErrorCode, type ApiErrorBody, type ErrorDetail } from '@app/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isMalformedUuidError } from '../db/client';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ErrorDetail[] | undefined;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** 400 VALIDATION_FAILED. `details` needs at least one entry naming an invalid input. */
export function validationError(details: ErrorDetail[], message = 'Validation failed'): AppError {
  return new AppError(400, ErrorCode.VALIDATION_FAILED, message, details);
}

export function unauthenticated(message = 'Authentication required'): AppError {
  return new AppError(401, ErrorCode.UNAUTHENTICATED, message);
}

export function forbidden(message = 'Forbidden'): AppError {
  return new AppError(403, ErrorCode.FORBIDDEN, message);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, ErrorCode.NOT_FOUND, message);
}

/** 409 for state conflicts, with a feature-specific code. */
export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}

/** 422 for business-rule violations on well-formed input, with a feature-specific code. */
export function unprocessable(code: string, message: string): AppError {
  return new AppError(422, code, message);
}

function errorBody(code: string, message: string, details?: ErrorDetail[]): ApiErrorBody {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

interface AjvLikeError {
  instancePath?: string;
  keyword?: string;
  params?: Record<string, unknown>;
  message?: string;
}

function ajvErrorToDetail(error: AjvLikeError): ErrorDetail {
  const segments = (error.instancePath ?? '').split('/').filter((segment) => segment !== '');
  const missing = error.params?.missingProperty;
  if (error.keyword === 'required' && typeof missing === 'string') segments.push(missing);
  return { path: segments.join('.'), message: error.message ?? 'Invalid value' };
}

const CODE_BY_STATUS: Record<number, string> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  405: ErrorCode.NOT_FOUND,
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details));
    return;
  }

  // Fastify route-schema validation (if a route declares one). Path params are ids or keys, and a
  // malformed one behaves like an unknown one (§1.3).
  if (Array.isArray(error.validation)) {
    if (error.validationContext === 'params') {
      void reply.status(404).send(errorBody(ErrorCode.NOT_FOUND, 'Not found'));
      return;
    }
    const details = (error.validation as AjvLikeError[]).map(ajvErrorToDetail);
    void reply.status(400).send(errorBody(ErrorCode.VALIDATION_FAILED, 'Validation failed', details));
    return;
  }

  // Safety net for a malformed id that reached a uuid column without idEquals(): treat it like an
  // unknown id (§1.3), never a 500. Logged, because a list filter should have matched nothing
  // instead. Only uuid input errors land here: any other rejected value (an unvalidated integer or
  // enum text, say) is a bug and falls through to the 500 below.
  if (isMalformedUuidError(error)) {
    request.log.warn({ err: error }, 'malformed id reached a uuid column; query request ids with idEquals()');
    void reply.status(404).send(errorBody(ErrorCode.NOT_FOUND, 'Not found'));
    return;
  }

  const status = error.statusCode;
  if (status !== undefined && status >= 400 && status < 500) {
    const code = CODE_BY_STATUS[status] ?? `HTTP_${status}`;
    const details = code === ErrorCode.VALIDATION_FAILED ? [{ path: '', message: error.message }] : undefined;
    void reply.status(status === 405 ? 404 : status).send(errorBody(code, error.message, details));
    return;
  }

  request.log.error({ err: error }, 'unhandled error');
  void reply.status(500).send(errorBody(ErrorCode.INTERNAL, 'Internal server error'));
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply): void {
  void reply.status(404).send(errorBody(ErrorCode.NOT_FOUND, 'Route not found'));
}
