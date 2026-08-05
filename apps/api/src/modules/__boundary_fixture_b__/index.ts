// Fixture for the intra-app module-boundary regression check (T4).
// The correct way for module B to consume module A: via A's index.ts only.
import { publicApiA } from '../__boundary_fixture_a__/index.js';

export const publicApiB = publicApiA;
