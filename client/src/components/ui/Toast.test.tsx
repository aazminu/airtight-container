import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

function Trigger({
  tone,
  durationMs,
}: {
  tone?: 'info' | 'success' | 'error';
  durationMs?: number;
}) {
  const { toast } = useToast();
  return (
    <button onClick={() => toast('Hello world', { tone, durationMs })}>
      fire
    </button>
  );
}

describe('Toast', () => {
  it('renders a toast when toast() is called', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('status')).toHaveTextContent('Hello world');
  });

  it('uses role=alert for error tone', async () => {
    render(
      <ToastProvider>
        <Trigger tone="error" />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hello world');
  });

  it('auto-dismisses after the configured duration', async () => {
    render(
      <ToastProvider>
        <Trigger durationMs={50} />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByRole('status'));
  });

  it('throws if useToast is used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
