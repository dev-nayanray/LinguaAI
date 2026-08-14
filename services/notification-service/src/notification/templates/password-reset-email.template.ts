export interface PasswordResetEmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * `identity.password.reset_requested` (E16 T2, design doc §1). `resetLink`
 * is built by the caller from `APP_URL` + the raw `resetToken` the event
 * payload now carries (`identityPasswordResetRequestedPayloadSchema`'s own
 * doc comment explains why) — `/password-reset/confirm?token=...` matches
 * `apps/web/src/app/password-reset/confirm/page.tsx`'s own already-real
 * query-param contract exactly (that page's own doc comment: "not built
 * here — no email delivery exists yet, T19's flagged gap" — this closes it).
 */
export function renderPasswordResetEmail(resetLink: string): PasswordResetEmailContent {
  const subject = 'Reset your LinguaAI password';
  const text = `A password reset was requested for your LinguaAI account.\n\nReset your password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`;
  const html = `<p>A password reset was requested for your LinguaAI account.</p><p><a href="${resetLink}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`;
  return { subject, html, text };
}
