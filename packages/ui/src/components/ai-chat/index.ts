// E3 T10 — DESIGN_SYSTEM.md §4's AI chat components category: message
// bubble, streaming-token renderer, voice waveform/recording indicator,
// thinking/typing distinction, voice-session state machine, inline
// correction/diff UI, agent persona header. `Avatar` (the primitive
// AgentPersonaHeader composes) lives in `../ui/avatar` — generic enough
// that other categories may reuse it later, same pattern as `Skeleton`.
export { MessageBubble, type MessageBubbleProps } from './message-bubble';
export {
  StreamingTokenRenderer,
  type StreamingTokenRendererProps,
} from './streaming-token-renderer';
export {
  VoiceWaveformIndicator,
  type VoiceWaveformIndicatorProps,
} from './voice-waveform-indicator';
export {
  ThinkingIndicator,
  type ThinkingIndicatorProps,
  type ThinkingPhase,
} from './thinking-indicator';
export {
  VoiceSessionIndicator,
  type VoiceSessionIndicatorProps,
  type VoiceSessionState,
} from './voice-session-indicator';
export {
  InlineCorrection,
  type InlineCorrectionProps,
  type InlineCorrectionPart,
} from './inline-correction';
export { AgentPersonaHeader, type AgentPersonaHeaderProps } from './agent-persona-header';
