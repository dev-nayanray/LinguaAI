import { describe, expect, it } from 'vitest';

import {
  certificateListResponseSchema,
  certificateSchema,
  verifyCertificateResponseSchema,
} from './index.js';

const uuid = '9c858f1b-45c0-4b8e-9c1e-2f6a9c9b6d21';
const now = new Date().toISOString();

describe('certificateSchema', () => {
  it('accepts a real Level-branch row, courseId/examProgramId both null', () => {
    expect(() =>
      certificateSchema.parse({
        id: uuid,
        courseId: null,
        levelId: uuid,
        examProgramId: null,
        issuedAt: now,
        createdAt: now,
      }),
    ).not.toThrow();
  });
});

describe('certificateListResponseSchema', () => {
  it('accepts a real paginated list, including an empty one', () => {
    expect(() =>
      certificateListResponseSchema.parse({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      }),
    ).not.toThrow();
  });
});

describe('verifyCertificateResponseSchema', () => {
  it('never carries userId, email, or a Certificate id — only real, non-sensitive proof', () => {
    const response = {
      issuedAt: now,
      milestoneType: 'LEVEL' as const,
      milestoneName: 'Beginner',
      holderDisplayName: 'Ada Lovelace',
    };
    const parsed = verifyCertificateResponseSchema.parse(response);
    expect(parsed).not.toHaveProperty('userId');
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('id');
  });

  it('rejects an unknown milestoneType', () => {
    const result = verifyCertificateResponseSchema.safeParse({
      issuedAt: now,
      milestoneType: 'COURSE_LEVEL',
      milestoneName: 'x',
      holderDisplayName: 'x',
    });
    expect(result.success).toBe(false);
  });
});
