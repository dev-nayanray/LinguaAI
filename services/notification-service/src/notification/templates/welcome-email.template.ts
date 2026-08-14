export interface WelcomeEmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * `identity.user.registered` (E16 T2, design doc §1) — a real, functional
 * plain-text/HTML template sufficient to prove the pipeline end-to-end, not
 * final marketing copy (§10's own open question names real copy/branding
 * as a separate, later product decision).
 */
export function renderWelcomeEmail(displayName: string): WelcomeEmailContent {
  const subject = 'Welcome to LinguaAI';
  const text = `Hi ${displayName},\n\nWelcome to LinguaAI! Your account is ready — jump back in any time to keep learning.\n\nThe LinguaAI team`;
  const html = `<p>Hi ${displayName},</p><p>Welcome to LinguaAI! Your account is ready — jump back in any time to keep learning.</p><p>The LinguaAI team</p>`;
  return { subject, html, text };
}
