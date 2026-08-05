// Client/browser-safe entry point (@linguaai/observability/client) —
// deliberately separate from index.ts. Importing `createLogger` through
// the main barrel still pulls in init.ts's module-level import of
// @opentelemetry/sdk-trace-node (NodeTracerProvider), which itself
// requires Node's `async_hooks` at the top of the module — verified
// empirically against a real `next build`: Turbopack does NOT tree-shake
// that away just because `initObservability` itself goes unused, and the
// build fails outright ("Module not found: Can't resolve 'async_hooks'").
// This file only re-exports what has no such dependency (correlation.ts
// uses @opentelemetry/api only, not sdk-trace-node), so client bundlers
// can never accidentally reach the Node-only code path — a structural
// guarantee, not a hoped-for optimization.
export { createLogger, type Logger, type CreateLoggerOptions } from './logger.js';
export { getCorrelationId } from './correlation.js';
