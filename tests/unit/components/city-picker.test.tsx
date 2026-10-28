import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchPlacesAction = vi.fn();
vi.mock('@/modules/geo/actions', () => ({ searchPlacesAction: (...a: unknown[]) => searchPlacesAction(...a) }));

import { CityPicker } from '@/components/trips/city-picker';

const jaipur = { label: 'Jaipur, Rajasthan', detail: 'Rajasthan', lat: 26.9, lng: 75.8 };
const ok = (places: unknown[], limited = false) => ({ ok: true, data: { places, limited } });

beforeEach(() => {
  vi.useFakeTimers();
  searchPlacesAction.mockReset();
});
afterEach(() => vi.useRealTimers());

function type(value: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
}

async function flush(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('CityPicker', () => {
  it('does not search for a single character', async () => {
    render(<CityPicker name="from" id="from" placeholder="From" />);
    type('j');
    await flush(1000);
    expect(searchPlacesAction).not.toHaveBeenCalled();
  });

  it('searches once after a 250 ms pause', async () => {
    searchPlacesAction.mockResolvedValue(ok([jaipur]));
    render(<CityPicker name="from" id="from" placeholder="From" />);
    type('ja');
    await flush(249);
    expect(searchPlacesAction).not.toHaveBeenCalled();
    await flush(1);
    expect(searchPlacesAction).toHaveBeenCalledTimes(1);
    expect(searchPlacesAction).toHaveBeenCalledWith({ q: 'ja' });
  });

  it('shows the label and the muted detail line', async () => {
    searchPlacesAction.mockResolvedValue(ok([jaipur]));
    render(<CityPicker name="from" id="from" placeholder="From" />);
    type('jai');
    await flush();
    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('Jaipur, Rajasthan');
    expect(option).toHaveTextContent('Rajasthan');
  });

  it('ignores a slow response that arrives after a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    searchPlacesAction
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(ok([{ ...jaipur, label: 'Jaisalmer, Rajasthan' }]));
    render(<CityPicker name="from" id="from" placeholder="From" />);
    type('ja');
    await flush();
    type('jais');
    await flush();
    await act(async () => resolveFirst(ok([jaipur])));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Jaisalmer'),
    ]);
  });

  it('shows a hint when results are rate-limited', async () => {
    searchPlacesAction.mockResolvedValue(ok([jaipur], true));
    render(<CityPicker name="from" id="from" placeholder="From" />);
    type('jai');
    await flush();
    expect(screen.getByText('Showing popular places')).toBeInTheDocument();
  });

  it('shows a hint when search fails', async () => {
    searchPlacesAction.mockRejectedValue(new Error('network'));
    render(<CityPicker name="from" id="from" placeholder="From" />);
    type('jai');
    await flush();
    expect(screen.getByText('Search is unavailable — try a city name')).toBeInTheDocument();
  });

  it('offers "Choose on map…" only when allowMapPick is set', async () => {
    searchPlacesAction.mockResolvedValue(ok([jaipur]));
    const { unmount } = render(<CityPicker name="from" id="from" placeholder="From" />);
    type('jai');
    await flush();
    expect(screen.queryByText('Choose on map…')).toBeNull();
    unmount();
    const onMapPick = vi.fn();
    render(<CityPicker name="from" id="from" placeholder="From" allowMapPick onMapPick={onMapPick} />);
    type('jai');
    await flush();
    fireEvent.mouseDown(screen.getByText('Choose on map…'));
    expect(onMapPick).toHaveBeenCalled();
  });
});
