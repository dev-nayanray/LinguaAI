import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Request-body validation at the API boundary (CLAUDE.md, CODING_STANDARDS.md
 * §1) using the same Zod schemas `packages/validation` already exports for
 * the frontend — one schema, not a parallel `class-validator` DTO. A failed
 * parse becomes a 400 `BadRequestException`, which `GlobalExceptionFilter`
 * already maps to the `VALIDATION_ERROR` envelope (API_GUIDELINES.md §3) —
 * no new error-handling path introduced here.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(message);
    }
    return result.data;
  }
}
