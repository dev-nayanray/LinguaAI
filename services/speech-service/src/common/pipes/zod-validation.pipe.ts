import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Request-body validation at `speech-service`'s own new REST boundary
 * (E11 T1) — the same pattern `apps/api`/`ai-engine` each already
 * established (`common/pipes/zod-validation.pipe.ts`), copied rather than
 * extracted into a shared package: this 20-line class has no
 * service-specific dependency, and a shared-package extraction for its
 * third consumer isn't warranted over duplicating it once more. A failed
 * parse becomes a 400 `BadRequestException`.
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
