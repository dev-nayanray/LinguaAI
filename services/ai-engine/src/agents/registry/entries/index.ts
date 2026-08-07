import { conversationPartnerToolRegistryEntry } from './conversation-partner.entry.js';
import { examCoachToolRegistryEntry } from './exam-coach.entry.js';
import { personalLanguageTeacherToolRegistryEntry } from './personal-language-teacher.entry.js';
import { vocabularyCoachToolRegistryEntry } from './vocabulary-coach.entry.js';
import { writingCoachToolRegistryEntry } from './writing-coach.entry.js';
import type { ToolRegistryEntry } from '../tool-registry.types.js';

/** One entry per `OrchestratorAgentPersona` value — tool-registry.service.spec.ts asserts this set is exhaustive. */
export const TOOL_REGISTRY_ENTRIES: readonly ToolRegistryEntry[] = [
  personalLanguageTeacherToolRegistryEntry,
  conversationPartnerToolRegistryEntry,
  vocabularyCoachToolRegistryEntry,
  writingCoachToolRegistryEntry,
  examCoachToolRegistryEntry,
];
