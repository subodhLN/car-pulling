import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { RouteMap } from '@/components/map/route-map';

describe('RouteMap frame', () => {
  it('is a labelled region (not an img, which would hide the zoom controls from assistive tech)', () => {
    render(
      <RouteMap origin={{ lat: 28.6, lng: 77.2, label: 'Delhi' }} dest={{ lat: 26.9, lng: 75.8, label: 'Jaipur' }} polyline={null} />,
    );
    expect(screen.getByRole('region', { name: 'Map of the route from Delhi to Jaipur' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
