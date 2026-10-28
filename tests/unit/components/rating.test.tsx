import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Rating } from '@/components/reviews/rating';

describe('Rating', () => {
  it('shows "New" when there are no reviews', () => {
    expect(render(<Rating avg={0} count={0} />).container).toHaveTextContent(/^New$/);
  });

  it('shows the average to one decimal and the count', () => {
    expect(render(<Rating avg={4.333} count={3} />).container).toHaveTextContent(/^★ 4\.3 \(3\)$/);
  });

  it('describes the rating for screen readers', () => {
    const { getByTitle } = render(<Rating avg={4.8} count={12} />);
    expect(getByTitle('Rated 4.8 out of 5 from 12 reviews')).toBeInTheDocument();
  });
});
