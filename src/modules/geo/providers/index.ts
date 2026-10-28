import type { GeoProvider } from '../types';
import { fakeProvider } from './fake';
import { osrmProvider } from './osrm';
import { photonProvider } from './photon';

const liveProvider: GeoProvider = {
  search: photonProvider.search,
  reverse: photonProvider.reverse,
  route: osrmProvider.route,
};

/** `GEO_PROVIDER=fake` in tests, CI and e2e; live (Photon + OSRM) otherwise. */
export function getProvider(): GeoProvider {
  return process.env.GEO_PROVIDER === 'fake' ? fakeProvider : liveProvider;
}
