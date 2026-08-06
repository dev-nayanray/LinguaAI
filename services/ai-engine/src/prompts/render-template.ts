const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Fails closed on a missing variable rather than sending a literal
 * `{{placeholder}}` to a paid model call — a template/caller mismatch is a
 * programming error, not something a learner-facing generation request
 * should silently absorb.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    if (!(name in variables)) {
      throw new Error(
        `Prompt template references undefined variable "{{${name}}}" — refusing to render with a missing value`,
      );
    }
    return variables[name]!;
  });
}
