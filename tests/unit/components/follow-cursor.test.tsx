import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FollowCursor } from '@/components/layout/follow-cursor';

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('FollowCursor', () => {
  it('renders its children where matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(
      <FollowCursor label="View">
        <span>card</span>
      </FollowCursor>,
    );
    expect(screen.getByText('card')).toBeInTheDocument();
  });

  it('renders only its children for coarse pointers or reduced motion', () => {
    mockMatchMedia(false);
    render(
      <FollowCursor label="View Delhi → Jaipur →">
        <a href="/r">Delhi → Jaipur</a>
      </FollowCursor>,
    );
    expect(screen.getByRole('link', { name: 'Delhi → Jaipur' })).toBeInTheDocument();
    expect(screen.queryByText('View Delhi → Jaipur →')).not.toBeInTheDocument();
  });

  it('shows a hidden-from-AT pill label while a fine pointer hovers', () => {
    mockMatchMedia(true);
    render(
      <FollowCursor label="View Delhi → Jaipur →">
        <a href="/r">Delhi → Jaipur</a>
      </FollowCursor>,
    );
    const pill = screen.getByText('View Delhi → Jaipur →');
    expect(pill).toHaveAttribute('aria-hidden', 'true');
    expect(pill).not.toHaveAttribute('data-on');

    const card = screen.getByRole('link').parentElement!;
    fireEvent.pointerEnter(card, { clientX: 120, clientY: 80, pointerType: 'mouse' });
    expect(pill).toHaveAttribute('data-on');
    expect(pill.style.left).toBe('120px');
    expect(pill.style.top).toBe('80px');

    fireEvent.pointerLeave(card, { pointerType: 'mouse' });
    expect(pill).not.toHaveAttribute('data-on');
  });
});
