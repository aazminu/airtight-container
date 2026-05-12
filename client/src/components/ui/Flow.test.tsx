import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Flow, FlowStep } from './Flow';

describe('Flow', () => {
  it('renders the active step by index', () => {
    render(
      <Flow step={1}>
        <FlowStep>step zero</FlowStep>
        <FlowStep>step one</FlowStep>
        <FlowStep>step two</FlowStep>
      </Flow>
    );
    expect(screen.queryByText('step zero')).not.toBeInTheDocument();
    expect(screen.getByText('step one')).toBeInTheDocument();
    expect(screen.queryByText('step two')).not.toBeInTheDocument();
  });

  it('swaps the rendered child when step changes', () => {
    const { rerender } = render(
      <Flow step={0}>
        <FlowStep>first</FlowStep>
        <FlowStep>second</FlowStep>
      </Flow>
    );
    expect(screen.getByText('first')).toBeInTheDocument();
    act(() => {
      rerender(
        <Flow step={1}>
          <FlowStep>first</FlowStep>
          <FlowStep>second</FlowStep>
        </Flow>
      );
    });
    expect(screen.queryByText('first')).not.toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('renders nothing when step is out of range', () => {
    const { container } = render(
      <Flow step={5}>
        <FlowStep>only step</FlowStep>
      </Flow>
    );
    expect(screen.queryByText('only step')).not.toBeInTheDocument();
    // Wrapper still mounts (animation host); but the inner step container is empty.
    expect(container.querySelector('[data-direction]')).toBeTruthy();
  });

  it('applies forward direction by default and switches to back on regress', () => {
    const { rerender, container } = render(
      <Flow step={0}>
        <FlowStep>a</FlowStep>
        <FlowStep>b</FlowStep>
      </Flow>
    );
    const initial = container.querySelector('[data-direction]') as HTMLElement;
    expect(initial.dataset.direction).toBe('forward');

    rerender(
      <Flow step={1}>
        <FlowStep>a</FlowStep>
        <FlowStep>b</FlowStep>
      </Flow>
    );
    // After effect runs, still forward (1 > 0).
    expect(
      (container.querySelector('[data-direction]') as HTMLElement).dataset.direction
    ).toBe('forward');

    rerender(
      <Flow step={0}>
        <FlowStep>a</FlowStep>
        <FlowStep>b</FlowStep>
      </Flow>
    );
    expect(
      (container.querySelector('[data-direction]') as HTMLElement).dataset.direction
    ).toBe('back');
  });
});
