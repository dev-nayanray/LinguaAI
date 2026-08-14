/**
 * Real MailHog HTTP API client (E16 T2) — the first consumer of this in the
 * repo (confirmed via a full-repo search before writing this). MailHog's
 * own standard REST API (`docker-compose.yml`'s own `mailhog` service),
 * not repo-specific: `GET /api/v2/messages` lists received messages,
 * `DELETE /api/v2/messages` clears the inbox between tests. Used to prove
 * a real email was actually sent and received (design doc §3.2's own
 * "prove the real thing, not a mock" testing advantage), not merely that
 * `nodemailer` was called with the right arguments.
 */

interface MailHogMessage {
  Content: {
    Headers: { To?: string[]; Subject?: string[] };
    Body: string;
  };
}

interface MailHogMessagesResponse {
  items: MailHogMessage[];
}

function mailhogBaseUrl(): string {
  const port = process.env.MAILHOG_UI_PORT ?? '8025';
  return `http://localhost:${port}`;
}

/**
 * Real bug found while building this test (E16 T2): MailHog's bulk
 * "delete all messages" endpoint is `DELETE /api/v1/messages` — `v2`'s own
 * `DELETE /api/v2/messages/{id}` only deletes a single message by id;
 * calling it with no id 404s (confirmed via `curl`, silently ignorable if
 * the response status is never checked, which is exactly what left the
 * inbox never actually cleared between tests the first time this was
 * written).
 */
export async function clearMailhogInbox(): Promise<void> {
  const res = await fetch(`${mailhogBaseUrl()}/api/v1/messages`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to clear MailHog inbox: ${res.status} ${res.statusText}`);
  }
}

/** Polls MailHog's own inbox until a message `To`-addressed to `email` appears, or `timeoutMs` elapses. */
export async function waitForEmail(
  email: string,
  timeoutMs = 10000,
): Promise<{ subject: string; body: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailhogBaseUrl()}/api/v2/messages`);
    const data = (await res.json()) as MailHogMessagesResponse;
    const match = data.items.find((item) =>
      (item.Content.Headers.To ?? []).some((to) => to.includes(email)),
    );
    if (match) {
      return {
        subject: match.Content.Headers.Subject?.[0] ?? '',
        body: match.Content.Body,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No email to "${email}" appeared in MailHog within ${timeoutMs}ms`);
}

/** Confirms no email to `email` lands within `windowMs` — used to prove a suppressed (opted-out) send never actually sent. */
export async function assertNoEmail(email: string, windowMs = 3000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const res = await fetch(`${mailhogBaseUrl()}/api/v2/messages`);
  const data = (await res.json()) as MailHogMessagesResponse;
  const match = data.items.find((item) =>
    (item.Content.Headers.To ?? []).some((to) => to.includes(email)),
  );
  if (match) {
    throw new Error(`An unexpected email to "${email}" was found in MailHog`);
  }
}
