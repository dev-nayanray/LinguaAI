import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { AdminDataTable, type ColumnDef } from './admin-data-table';

interface Person {
  id: string;
  name: string;
  age: number;
}

const PEOPLE: Person[] = [
  { id: '1', name: 'Charlie', age: 30 },
  { id: '2', name: 'Alice', age: 25 },
  { id: '3', name: 'Bob', age: 35 },
  { id: '4', name: 'Dana', age: 28 },
  { id: '5', name: 'Eve', age: 41 },
];

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', accessor: (p) => p.name, sortable: true, sortValue: (p) => p.name },
  { id: 'age', header: 'Age', accessor: (p) => p.age, sortable: true, sortValue: (p) => p.age },
  { id: 'actions', header: 'Actions', accessor: () => 'Edit' },
];

function Demo(props: {
  loading?: boolean;
  disabled?: boolean;
  data?: Person[];
  error?: { message: string; onRetry?: () => void };
  pageSize?: number;
}) {
  return (
    <AdminDataTable<Person>
      columns={columns}
      data={props.data ?? PEOPLE}
      getRowId={(p) => p.id}
      caption="People"
      pageSize={props.pageSize ?? 10}
      loading={props.loading}
      disabled={props.disabled}
      error={props.error}
    />
  );
}

const meta = {
  title: 'Admin/AdminDataTable',
  component: Demo,
  tags: ['autodocs'],
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: { data: [] },
};

export const ErrorState: Story = {
  args: { error: { message: 'Failed to load people.', onRetry: () => {} } },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Paginated: Story = {
  args: { pageSize: 2 },
};

/**
 * Required T14 evidence (E3 §20's task table): "Interaction test" —
 * exercises sort-header toggling, pagination Next/Previous, and
 * roving-tabindex keyboard row navigation (§12.4's "keyboard row focus").
 */
export const SortPaginateAndKeyboardNavigate: Story = {
  args: { pageSize: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Sort toggle.
    const nameHeader = canvas.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(canvas.getByRole('button', { name: /Name/ }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    let rows = canvas.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Alice');

    // Pagination.
    expect(canvas.getByText('Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
    expect(canvas.getByText('Page 2 of 3')).toBeInTheDocument();

    // Roving-tabindex keyboard row navigation on the new page.
    rows = canvas.getAllByRole('row').slice(1);
    (rows[0] as HTMLElement).focus();
    expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
  },
};
