// Request-body parsing and route-schema validators (docs/contract.md §1.2).
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { FastifyInstance } from 'fastify';
import { AppError } from './errors';

/**
 * JSON bodies only. A missing or empty body is treated as `{}`, whatever its Content-Type; a
 * non-empty body that is not valid JSON gets 400 VALIDATION_FAILED; a non-empty body of another
 * media type gets 415.
 */
export function registerBodyParsers(app: FastifyInstance): void {
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.length === 0) {
      done(null, {});
      return;
    }
    void parseJson(request, text, done);
  });
  app.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => {
    if (body.length === 0) {
      done(null, {});
      return;
    }
    done(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON with Content-Type: application/json'), undefined);
  });
}

/**
 * Validators for Fastify route schemas, if a route declares one: body validation never coerces
 * types (`"3"` is not an integer), while query strings and params keep Fastify's usual coercion.
 * Prefer the Zod helpers in ./validation.ts, which also apply the contract's trimming rules.
 */
export function registerSchemaValidators(app: FastifyInstance): void {
  const options = { allErrors: true, removeAdditional: true, useDefaults: true, strict: false } as const;
  const bodyAjv = new Ajv({ ...options, coerceTypes: false });
  const otherAjv = new Ajv({ ...options, coerceTypes: 'array' });
  addFormats(bodyAjv);
  addFormats(otherAjv);
  app.setValidatorCompiler(({ schema, httpPart }) =>
    (httpPart === 'body' ? bodyAjv : otherAjv).compile(schema),
  );
}
