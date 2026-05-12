import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Available</Badge>);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('applies the tone class', () => {
    render(<Badge tone="success">OK</Badge>);
    const el = screen.getByText('OK');
    expect(el.className).toMatch(/success/);
  });

  it('merges custom className', () => {
    render(<Badge className="extra">x</Badge>);
    expect(screen.getByText('x').className).toContain('extra');
  });
});
