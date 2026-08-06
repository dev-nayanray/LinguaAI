import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentPersonaHeader } from './agent-persona-header';

describe('AgentPersonaHeader', () => {
  it('renders the agent name and an avatar with initials', () => {
    render(<AgentPersonaHeader name="Luma" />);
    // "Luma" legitimately appears twice — the visible name line, and the
    // Avatar's own sr-only fallback text next to its initials glyph.
    expect(screen.getAllByText('Luma')).toHaveLength(2);
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('renders the optional title', () => {
    render(<AgentPersonaHeader name="Luma" title="AI Language Tutor" />);
    expect(screen.getByText('AI Language Tutor')).toBeInTheDocument();
  });

  it('omits the title line when not provided', () => {
    render(<AgentPersonaHeader name="Luma" />);
    expect(screen.queryByText('AI Language Tutor')).not.toBeInTheDocument();
  });
});
