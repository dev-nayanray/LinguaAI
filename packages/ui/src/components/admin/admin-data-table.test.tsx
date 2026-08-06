import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
];

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', accessor: (p) => p.name, sortable: true, sortValue: (p) => p.name },
  { id: 'age', header: 'Age', accessor: (p) => p.age, sortable: true, sortValue: (p) => p.age },
];

function renderTable(overrides: Partial<ComponentProps<typeof AdminDataTable<Person>>> = {}) {
  return render(
    <AdminDataTable<Person>
      columns={columns}
      data={PEOPLE}
      getRowId={(p) => p.id}
      caption="People"
      {...overrides}
    />,
  );
}

function dataRows() {
  return screen.getAllByRole('row').slice(1); // drop the header row
}

function requireElement(element: HTMLElement | undefined): HTMLElement {
  if (!element) throw new Error('Expected element to exist');
  return element;
}

describe('AdminDataTable', () => {
  it('renders the default state: headers and every row', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
    expect(dataRows()).toHaveLength(3);
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders skeleton rows in the loading state, not row data', () => {
    renderTable({ loading: true, pageSize: 4 });
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
    expect(dataRows()).toHaveLength(4);
  });

  it('renders the empty state with the emptyMessage', () => {
    renderTable({ data: [], emptyMessage: 'No people found.' });
    expect(screen.getByText('No people found.')).toBeInTheDocument();
  });

  it('renders the error state and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderTable({ error: { message: 'Failed to load people.', onRetry } });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load people.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the error state without a retry button when onRetry is omitted', () => {
    renderTable({ error: { message: 'Failed to load people.' } });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('disables sort headers when disabled, but keeps row data visible', () => {
    renderTable({ disabled: true });
    expect(screen.getByRole('button', { name: /Name/ })).toBeDisabled();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('cycles column sort none -> ascending -> descending -> none, reordering rows', async () => {
    const user = userEvent.setup();
    renderTable();

    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(within(requireElement(dataRows()[0])).getByText('Alice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    expect(within(requireElement(dataRows()[0])).getByText('Charlie')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('does not render a sort button for a non-sortable column', () => {
    renderTable({
      columns: [...columns, { id: 'actions', header: 'Actions', accessor: () => 'Edit' }],
    });
    expect(screen.getByRole('columnheader', { name: 'Actions' })).not.toHaveAttribute('aria-sort');
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('paginates: shows pageSize rows per page and navigates with Next/Previous', async () => {
    const user = userEvent.setup();
    renderTable({ pageSize: 2 });

    expect(dataRows()).toHaveLength(2);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(dataRows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('moves roving row focus with ArrowDown/ArrowUp without leaving the table', async () => {
    const user = userEvent.setup();
    renderTable();

    const rows = dataRows();
    requireElement(rows[0]).focus();
    expect(rows[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(rows[2]).toHaveFocus();

    // Stays on the last row rather than moving past it.
    await user.keyboard('{ArrowDown}');
    expect(rows[2]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(rows[1]).toHaveFocus();
  });

  it('only the focused row is in the natural tab order (roving tabindex)', () => {
    renderTable();
    const rows = dataRows();
    expect(rows[0]).toHaveAttribute('tabindex', '0');
    expect(rows[1]).toHaveAttribute('tabindex', '-1');
    expect(rows[2]).toHaveAttribute('tabindex', '-1');
  });
});
