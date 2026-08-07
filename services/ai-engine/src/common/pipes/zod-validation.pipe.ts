import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Request-body validation at ai-engine's own REST boundary (ADR-033, T10) —
 * the exact same pattern apps/api's own ZodValidationPipe already
 * established (apps/api/src/common/pipes/zod-validation.pipe.ts), copied
 * rather than extracted into a shared package: this 20-line class has no
 * apps/api-specific dependency, and a shared-package extraction for its
 * second consumer isn't warranted over duplicating it once. A failed parse
 * becomes a 400 `BadRequestException`, mapped to the `VALIDATION_ERROR`
 * envelope by `GlobalExceptionFilter` (API_GUIDELINES.md §3) — no new
 * error-handling path introduced here.
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
