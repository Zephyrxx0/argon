import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LandingPage from '@/app/page';

describe('Landing page', () => {
  it('leads with the core question and points every CTA at the workspace', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /what must i know before i touch this/i })
    ).toBeInTheDocument();

    const ctas = screen.getAllByRole('link', { name: /open workspace/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    expect(ctas.length).toBeLessThanOrEqual(2); // minimal CTAs
    ctas.forEach((a) => expect(a).toHaveAttribute('href', '/workspace'));
  });

  it('has no other links or buttons competing with the CTA', () => {
    render(<LandingPage />);
    const interactive = [...screen.queryAllByRole('link'), ...screen.queryAllByRole('button')];
    expect(interactive.every((el) => /open workspace/i.test(el.textContent ?? ''))).toBe(true);
  });

  it('renders the decorative graph canvas as hidden from assistive tech', () => {
    render(<LandingPage />);
    expect(screen.getByTestId('graph-field')).toHaveAttribute('aria-hidden', 'true');
  });
});
