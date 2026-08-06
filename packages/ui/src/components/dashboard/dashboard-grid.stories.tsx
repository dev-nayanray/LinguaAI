import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatCard } from '../cards/stat-card';
import { DashboardGrid, type DashboardGridProps } from './dashboard-grid';
import { Widget } from './widget';

function DemoWidgets() {
  return (
    <>
      <Widget>
        <StatCard label="XP this week" value={1250} />
      </Widget>
      <Widget>
        <StatCard label="Streak" value="14 days" trend={{ direction: 'up', label: '+3' }} />
      </Widget>
      <Widget>
        <StatCard label="Lessons completed" value={42} />
      </Widget>
      <Widget>
        <StatCard label="Accuracy" value="94%" />
      </Widget>
    </>
  );
}

// DashboardGrid's own `children` prop is required (E3 §12.4), which
// Storybook's CSF3 typing then requires every story's `args` to supply —
// awkward for a layout primitive whose whole point is arbitrary children.
// A local demo wrapper with optional props (matching Combobox's story
// precedent, E3 T5) sidesteps that without loosening the real component's
// contract.
function DashboardGridDemo(props: Omit<DashboardGridProps, 'children'>) {
  return (
    <DashboardGrid {...props}>
      <DemoWidgets />
    </DashboardGrid>
  );
}

const meta = {
  title: 'Dashboard/DashboardGrid',
  component: DashboardGridDemo,
  tags: ['autodocs'],
} satisfies Meta<typeof DashboardGridDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const TwoColumnsAtEveryBreakpoint: Story = {
  args: { columns: { mobile: 1, tablet: 2, desktop: 2 } },
};

export const LargeGap: Story = {
  args: { gap: 'lg' },
};
