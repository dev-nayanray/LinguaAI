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
  };
}
