import { aiGatewayEnvSchema, loadConfig } from '@linguaai/config';

export const AI_GATEWAY_CONFIG = Symbol('AI_GATEWAY_CONFIG');
/** Interfaces don't exist at runtime — RouterService injects concrete provider instances by these tokens, not by TypeScript type alone. */
export const ANTHROPIC_PROVIDER = Symbol('ANTHROPIC_PROVIDER');
export const OPENAI_PROVIDER = Symbol('OPENAI_PROVIDER');

/** What RouterService actually needs — narrower than the raw env shape, so the Router never touches process.env-shaped keys directly. */
export interface AiGatewayModuleConfig {
  defaultProvider: 'anthropic' | 'openai';
  anthropicApiKey: string;
  openAiApiKey: string;
  teacherModel: string;
  assessmentModel: string;
  /** E8 T4 (ADR-041) — the third `AiRequestClass`, AI-assisted content drafting. */
  contentModel: string;
  /** E10 T5 (ADR-048) — the fourth `AiRequestClass`, session-end fluency scoring. */
  fluencyModel: string;
  /** E13 T1 (ADR-052) — the fifth `AiRequestClass`, RAG-grounded writing correction. */
  writingModel: string;
  /** ADR-034 (T9): the circuit breaker's DEGRADE target per class — undefined when no economy model is configured for that class. */
  teacherEconomyModel: string | undefined;
  assessmentEconomyModel: string | undefined;
  contentEconomyModel: string | undefined;
  fluencyEconomyModel: string | undefined;
  writingEconomyModel: string | undefined;
}

/** Validated once, at module load (fail-fast, DEPLOYMENT.md §7) — same pattern as apps/api's auth.config.ts. */
export function resolveAiGatewayConfig(): AiGatewayModuleConfig {
  const env = loadConfig(aiGatewayEnvSchema);
  return {
    defaultProvider: env.AI_GATEWAY_DEFAULT_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    openAiApiKey: env.OPENAI_API_KEY,
    teacherModel: env.AI_MODEL_TEACHER_DEFAULT,
    assessmentModel: env.AI_MODEL_ASSESSMENT_DEFAULT,
    contentModel: env.AI_MODEL_CONTENT_DEFAULT,
    fluencyModel: env.AI_MODEL_FLUENCY_DEFAULT,
    writingModel: env.AI_MODEL_WRITING_DEFAULT,
    teacherEconomyModel: env.AI_MODEL_TEACHER_ECONOMY,
    assessmentEconomyModel: env.AI_MODEL_ASSESSMENT_ECONOMY,
    contentEconomyModel: env.AI_MODEL_CONTENT_ECONOMY,
    fluencyEconomyModel: env.AI_MODEL_FLUENCY_ECONOMY,
    writingEconomyModel: env.AI_MODEL_WRITING_ECONOMY,
  };
}
