// Fixture for the intra-app module-boundary regression check (T4).
// The module's public entry point — same-module imports of internal files
// (like this one) must remain allowed; only *cross*-module deep imports
// are forbidden.
import { internalServiceA } from './internal.service.js';

export const publicApiA = internalServiceA;
