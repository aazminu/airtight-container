import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        body
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with title when open', () => {
    render(
      <Modal open onClose={() => {}} title="Confirm delete">
        Are you sure?
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm delete')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="t">
        x
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Escape when closeOnEscape=false', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="t" closeOnEscape={false}>
        x
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses aria-label when no title is provided', () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="Untitled dialog">
        x
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Untitled dialog'
    );
  });
});
