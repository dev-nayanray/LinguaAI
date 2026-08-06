import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('shows only the active panel and switches on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">Profile settings</TabsContent>
        <TabsContent value="billing">Billing settings</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('Profile settings')).toBeInTheDocument();
    expect(screen.queryByText('Billing settings')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Billing' }));

    expect(screen.getByText('Billing settings')).toBeInTheDocument();
    expect(screen.queryByText('Profile settings')).not.toBeInTheDocument();
  });

  it('moves focus between tabs with arrow keys (roving tabindex)', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">Profile settings</TabsContent>
        <TabsContent value="billing">Billing settings</TabsContent>
      </Tabs>,
    );

    const profileTab = screen.getByRole('tab', { name: 'Profile' });
    const billingTab = screen.getByRole('tab', { name: 'Billing' });

    profileTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(billingTab).toHaveFocus();
  });
});
