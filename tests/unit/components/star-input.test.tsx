import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StarInput } from '@/components/reviews/star-input';

function Controlled({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return <StarInput name="rating" value={value} onChange={setValue} />;
}

describe('StarInput', () => {
  it('is a radio group named "Rating" with five labelled stars', () => {
    render(<Controlled />);
    const group = screen.getByRole('radiogroup', { name: 'Rating' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      '1 star',
      '2 stars',
      '3 stars',
      '4 stars',
      '5 stars',
    ]);
  });

  it('clicking star 4 sets the value to 4', () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(screen.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '5 stars' })).toHaveAttribute('aria-checked', 'false');
    expect(document.querySelector('input[name="rating"]')).toHaveValue('4');
  });

  it('ArrowRight from 4 moves to 5 and focuses it; ArrowLeft goes back', () => {
    render(<Controlled initial={4} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: '4 stars' }), { key: 'ArrowRight' });
    const five = screen.getByRole('radio', { name: '5 stars' });
    expect(five).toHaveAttribute('aria-checked', 'true');
    expect(five).toHaveFocus();
    fireEvent.keyDown(five, { key: 'ArrowRight' });
    expect(five).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(five, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
  });

  it('only one star is in the tab order (the checked one, or the first when empty)', () => {
    const { unmount } = render(<Controlled />);
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    unmount();
    render(<Controlled initial={3} />);
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });
});
