import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (e: { lngLat: { lat: number; lng: number } }) => void;
class FakeMap {
  static last: FakeMap;
  handlers: Record<string, Handler> = {};
  constructor(public opts: Record<string, unknown>) {
    FakeMap.last = this;
  }
  on(ev: string, h: Handler) {
    this.handlers[ev] = h;
  }
  addControl() {}
  remove() {}
  resize() {}
}
const markerSetLngLat = vi.fn();

vi.mock('maplibre-gl', () => ({
  default: {
    Map: function (o: Record<string, unknown>) {
      return new FakeMap(o);
    },
    NavigationControl: function () {},
    AttributionControl: function () {},
    Marker: function () {
      return { setLngLat: (...a: unknown[]) => (markerSetLngLat(...a), { addTo: () => ({}) }) };
    },
  },
}));

const reversePlaceAction = vi.fn();
vi.mock('@/modules/geo/actions', () => ({ reversePlaceAction: (...a: unknown[]) => reversePlaceAction(...a) }));

import { PickOnMapDialog } from '@/components/map/pick-on-map-dialog';

beforeEach(() => {
  reversePlaceAction.mockReset();
  markerSetLngLat.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

async function clickMap(lat: number, lng: number) {
  await act(async () => FakeMap.last.handlers.click({ lngLat: { lat, lng } }));
}

describe('PickOnMapDialog', () => {
  it('centres on India when there is no initial point', () => {
    render(<PickOnMapDialog open onPick={vi.fn()} onClose={vi.fn()} />);
    expect(FakeMap.last.opts).toMatchObject({ center: [78.9, 22.6], zoom: 4 });
  });

  it('reverse-geocodes the clicked point and confirms it', async () => {
    reversePlaceAction.mockResolvedValue({
      ok: true,
      data: { place: { label: 'Sindhi Camp, Jaipur', detail: 'Rajasthan', lat: 26.92, lng: 75.79 }, limited: false },
    });
    const onPick = vi.fn();
    render(<PickOnMapDialog open onPick={onPick} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use this place' })).toBeDisabled();
    await clickMap(26.9201, 75.7882);
    expect(reversePlaceAction).toHaveBeenCalledWith({ lat: 26.9201, lng: 75.7882 });
    expect(markerSetLngLat).toHaveBeenCalledWith([75.7882, 26.9201]);
    expect(screen.getByText('Sindhi Camp, Jaipur')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this place' }));
    // the clicked point is kept; the label comes from reverse geocoding
    expect(onPick).toHaveBeenCalledWith({ label: 'Sindhi Camp, Jaipur', detail: 'Rajasthan', lat: 26.9201, lng: 75.7882 });
  });

  it('falls back to a dropped-pin label when nothing is found', async () => {
    reversePlaceAction.mockResolvedValue({ ok: true, data: { place: null, limited: false } });
    const onPick = vi.fn();
    render(<PickOnMapDialog open onPick={onPick} onClose={vi.fn()} />);
    await clickMap(26.123456, 75.654321);
    fireEvent.click(screen.getByRole('button', { name: 'Use this place' }));
    expect(onPick).toHaveBeenCalledWith({
      label: 'Dropped pin (26.1235, 75.6543)',
      detail: null,
      lat: 26.123456,
      lng: 75.654321,
    });
  });

  it('refuses points outside India', async () => {
    render(<PickOnMapDialog open onPick={vi.fn()} onClose={vi.fn()} />);
    await clickMap(51.5, -0.1);
    expect(reversePlaceAction).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a place in India')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this place' })).toBeDisabled();
  });

  it('closes on Cancel', () => {
    const onClose = vi.fn();
    render(<PickOnMapDialog open onPick={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
