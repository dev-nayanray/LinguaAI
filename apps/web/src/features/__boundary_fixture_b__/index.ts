// Fixture for the intra-app frontend feature-boundary regression check (T4).
// The correct way for feature B to consume feature A: via A's index.ts only.
import { publicApiA } from '../__boundary_fixture_a__/index';

export const publicApiB = publicApiA;
