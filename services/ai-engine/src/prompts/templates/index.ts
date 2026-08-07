import { conversationPartnerTemplate } from './conversation-partner.template.js';
import { examCoachTemplate } from './exam-coach.template.js';
import { grammarCoachTemplate } from './grammar-coach.template.js';
import { personalLanguageTeacherTemplate } from './personal-language-teacher.template.js';
import { pronunciationCoachTemplate } from './pronunciation-coach.template.js';
import { vocabularyCoachTemplate } from './vocabulary-coach.template.js';
import { writingCoachTemplate } from './writing-coach.template.js';
import type { PromptTemplate } from '../prompt-template.types.js';

/** One entry per `AgentPersona` value — PromptManagerService.spec.ts asserts this set is exhaustive. */
export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  personalLanguageTeacherTemplate,
  conversationPartnerTemplate,
  vocabularyCoachTemplate,
  writingCoachTemplate,
  examCoachTemplate,
  grammarCoachTemplate,
  pronunciationCoachTemplate,
];
