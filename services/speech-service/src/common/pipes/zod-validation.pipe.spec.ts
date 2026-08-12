import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.string().email(), age: z.number().int().positive() });

  it('returns the parsed value for valid input', () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform({ email: 'a@b.com', age: 30 });
    expect(result).toEqual({ email: 'a@b.com', age: 30 });
  });

  it('throws BadRequestException with a path-qualified message for invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: 'not-an-email', age: -1 });
      throw new Error('expected transform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as { message: string };
      expect(response.message).toContain('email');
    }
  });

  it('labels a root-level issue as (root) rather than an empty path', () => {
    const rootSchema = z.string().email();
    const pipe = new ZodValidationPipe(rootSchema);
    try {
      pipe.transform('not-an-email');
      throw new Error('expected transform to throw');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as { message: string };
      expect(response.message).toContain('(root)');
    }
  });
});
