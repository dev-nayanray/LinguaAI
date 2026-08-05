// Fixture for the intra-app frontend feature-boundary regression check (T4).
// The feature's public entry point — same-feature imports of internal files
// (like this one) must remain allowed.
import { internalA } from './internal';

export const publicApiA = internalA;
