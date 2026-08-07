import type { AIAgentSession, AIMessage, PrismaClient } from '@linguaai/database';

import type { CircuitBreakerService } from '../../cost/circuit-breaker.service.js';
import type { CostMeterService } from '../../cost/cost-meter.service.js';
import type { GenerateResponse } from '../../gateway/model-provider.interface.js';
import type { RouterService } from '../../gateway/router.service.js';
import type { MemoryManagerService } from '../../memory/memory-manager.service.js';
import { OrchestratorService } from '../../orchestrator/orchestrator.service.js';
import { RollingSummaryCache } from '../../orchestrator/rolling-summary.cache.js';
import { PromptManagerService } from '../../prompts/prompt-manager.service.js';
import { SafetyLayerService } from '../../safety/safety-layer.service.js';
import { GOLDEN_SET_CASES } from './golden-set.fixtures.js';

function fakeSession(persona: AIAgentSession['orchestratorAgent']): AIAgentSession {
  return {
    id: 'golden-session',
    userId: 'golden-user',
    languageId: 'golden-lang',
    orchestratorAgent: persona,
    specialistInvocations: null,
    status: 'ACTIVE',
    rollingSummary: null,
    summarizedThroughAt: null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as AIAgentSession;
}

function fakePrisma(session: AIAgentSession) {
  return {
    aIAgentSession: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue(session),
    },
    aIMessage: {
      create: jest.fn().mockResolvedValue({ id: 'golden-assistant-msg' }),
      findMany: jest.fn().mockResolvedValue([] as AIMessage[]),
    },
  } as unknown as PrismaClient;
}

function fakeRouter(): jest.Mocked<Pick<RouterService, 'generate' | 'stream'>> {
  const response: GenerateResponse = {
    content: "a canned, deterministic reply — not a live model call (see this suite's own header)",
    inputTokens: 10,
    outputTokens: 10,
    modelId: 'golden-set-fixture-model',
    latencyMs: 1,
  };
  return { generate: jest.fn().mockResolvedValue(response), stream: jest.fn() };
}

/**
 * AI_GOVERNANCE.md §3's "Golden-set regression" suite — INTERIM version.
 *
 * What this checks: the real, deterministic pipeline shared by every
 * Orchestrator-capable persona — `PromptManagerService`'s real template
 * rendering, `SafetyLayerService`'s real boundary-delimiting of
 * memory-derived content, and `OrchestratorService`'s own single-voice
 * invariant (ADR-007) — stays correct across all 5 personas at once. The
 * Router is mocked (a canned response), so this suite never scores actual
 * model-generated tone/structure/helpfulness; see golden-set.fixtures.ts's
 * own header for why that's a real, out-of-scope gap for this interim
 * version, not a silently-dropped requirement.
 *
 * How a false negative would be caught: a template edit that breaks
 * `{{targetLanguageName}}`/`{{proficiencyLevel}}` substitution, drops the
 * persona's own stated identity line, or a wiring regression that stops
 * memory content from being boundary-delimited before reaching the system
 * prompt would all fail loudly here — this is exactly the class of defect
 * `PromptManagerService.spec.ts`/`orchestrator.service.spec.ts` individually
 * cannot catch, since each tests one component in isolation; this suite is
 * the integration-level gate across all 5 personas at once.
 *
 * Permanent, mature version: real live-model evaluation runs (scoring
 * actual generated text against a tone/structure/helpfulness rubric) are
 * owned by whichever future epic first budgets for live AI evaluation
 * infrastructure — the same "interim, a later epic owns the final form"
 * precedent E4 T11's RLS-lint script already set for this repo.
 */
describe('Golden-set regression (AI_GOVERNANCE.md §3, interim)', () => {
  it.each(GOLDEN_SET_CASES)(
    '$persona: renders the correct identity, substitutes variables, and boundary-delimits memory content',
    async (goldenCase) => {
      const session = fakeSession(goldenCase.persona);
      const prisma = fakePrisma(session);
      const router = fakeRouter();
      const memoryManager: jest.Mocked<Pick<MemoryManagerService, 'retrieveRelevantMemories'>> = {
        retrieveRelevantMemories: jest
          .fn()
          .mockResolvedValue([
            { id: 'mem-1', category: 'OTHER', fact: goldenCase.priorMemoryFact, confidence: 0.9 },
          ]),
      };
      const circuitBreaker: jest.Mocked<Pick<CircuitBreakerService, 'checkBreachState'>> = {
        checkBreachState: jest.fn().mockResolvedValue('NONE'),
      };
      const costMeter: jest.Mocked<Pick<CostMeterService, 'recordUsage'>> = {
        recordUsage: jest.fn().mockResolvedValue({ costUsdMicros: 0 }),
      };

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        new PromptManagerService(),
        memoryManager as unknown as MemoryManagerService,
        new SafetyLayerService(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        costMeter as unknown as CostMeterService,
      );

      await service.sendMessage({
        sessionId: session.id,
        userMessage: goldenCase.userMessage,
        variables: goldenCase.variables,
      });

      const [, request] = router.generate.mock.calls[0]!;
      const systemPrompt = request.systemPrompt ?? '';

      // Real template rendering — the persona's own stated identity survived, with variables substituted, not a literal "{{...}}" placeholder.
      expect(systemPrompt).toContain(goldenCase.expectedIdentityPhrase);
      expect(systemPrompt).toContain(goldenCase.variables.targetLanguageName);
      expect(systemPrompt).toContain(goldenCase.variables.proficiencyLevel);
      expect(systemPrompt).not.toContain('{{');

      // Real safety-layer boundary-delimiting of memory-derived content (T8) — the fact is present, but wrapped as untrusted data, not concatenated raw.
      expect(systemPrompt).toContain('<untrusted_context label="learner_memory">');
      expect(systemPrompt).toContain(goldenCase.priorMemoryFact);

      // Single-voice invariant (ADR-007) — the session's own fixed persona
      // is what rendered, never a second persona's identity bleeding in
      // (sendMessage takes no persona parameter at all; there is
      // structurally no code path for a second persona to post into the
      // same session).
      const otherIdentityPhrases = GOLDEN_SET_CASES.filter(
        (c) => c.persona !== goldenCase.persona,
      ).map((c) => c.expectedIdentityPhrase);
      for (const otherPhrase of otherIdentityPhrases) {
        expect(systemPrompt).not.toContain(otherPhrase);
      }
    },
  );
});
