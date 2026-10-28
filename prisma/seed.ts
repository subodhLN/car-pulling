/**
 * Demo data: ~30 users, cars for ~15 drivers, ~80 trips across the ten route cities, bookings in every
 * state. Idempotent: it truncates every application table, then inserts. Deterministic structure (seeded
 * PRNG); dates are relative to "now".
 *
 *   npm run db:seed                 # refuses to run when NODE_ENV=production
 *   SEED_ALLOW=1 npm run db:seed    # explicit override (e.g. seeding Neon for a soft launch)
 *
 * Future trips and bookings go through the real services (publishTrip, requestBooking, transition) so the
 * rules hold. publishTrip/requestBooking refuse past or imminent departures, so past (COMPLETED) trips and
 * bookings are inserted directly with the same SQL shape as tests/helpers/factories.ts.
 */
import { randomUUID } from 'node:crypto';
import type { BookingStatus, CancelledBy } from '@prisma/client';
import { db } from '@/lib/db';
import { DEMO_PASSWORD } from '@/modules/auth/demo-accounts';
import { signUp } from '@/modules/auth/service';
import { requestBooking, transition } from '@/modules/bookings/service';
import { ROUTE_CITIES, type Place } from '@/modules/geo/cities';
import { haversineKm } from '@/modules/geo/service';
import { publishTrip } from '@/modules/trips/service';
import { createVehicle } from '@/modules/vehicles/service';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env: rely on the real environment
}

if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW !== '1') {
  console.error('Refusing to seed: NODE_ENV=production. Set SEED_ALLOW=1 to override.');
  process.exit(1);
}

// --- deterministic PRNG (mulberry32) -------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261028);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

// --- data ----------------------------------------------------------------------------------------------
const FIRST = [
  'Aarav', 'Vivaan', 'Arjun', 'Kabir', 'Rohan', 'Ishaan', 'Aditya', 'Karan', 'Rahul', 'Siddharth',
  'Ananya', 'Diya', 'Meera', 'Priya', 'Kavya', 'Neha', 'Simran', 'Pooja', 'Riya', 'Tanvi',
];
const LAST = [
  'Sharma', 'Verma', 'Singh', 'Kaur', 'Gupta', 'Mehta', 'Malhotra', 'Chopra', 'Bansal', 'Khanna',
  'Bhatia', 'Arora', 'Kapoor', 'Joshi', 'Rawat', 'Thakur', 'Sethi', 'Grover', 'Saini', 'Bajwa',
];
const CARS: { make: string; model: string; seats: number }[] = [
  { make: 'Maruti Suzuki', model: 'Swift', seats: 4 },
  { make: 'Maruti Suzuki', model: 'Ertiga', seats: 6 },
  { make: 'Hyundai', model: 'i20', seats: 4 },
  { make: 'Hyundai', model: 'Creta', seats: 4 },
  { make: 'Tata', model: 'Nexon', seats: 4 },
  { make: 'Toyota', model: 'Innova Crysta', seats: 6 },
  { make: 'Honda', model: 'City', seats: 4 },
  { make: 'Mahindra', model: 'XUV700', seats: 5 },
];
const COLOURS = ['White', 'Silver', 'Grey', 'Black', 'Blue', 'Red'];
const NOTES = [
  'Leaving on time. Small bags only.',
  'AC on, music on request.',
  'One short chai stop on the way.',
  'Pickup near the metro station.',
  'No smoking please.',
];
const NOTE_PROB = 0.35;
// IST departure hours.
const HOURS = [5, 6, 7, 8, 9, 13, 16, 17, 18, 20];

const IST_OFFSET_MS = 5.5 * 3600e3;
const DAY_MS = 24 * 3600e3;
/** UTC instant for `hourIst` o'clock IST, `dayOffset` IST-days from today (negative = past). */
function istInstant(dayOffset: number, hourIst: number, minute = 0): Date {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const istMidnightUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(istMidnightUtc + dayOffset * DAY_MS + hourIst * 3600e3 + minute * 60e3 - IST_OFFSET_MS);
}

const city = (slug: string): Place => {
  const c = ROUTE_CITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`unknown city ${slug}`);
  return { label: c.label, lat: c.lat, lng: c.lng };
};

/** Popular corridors (both directions are used). */
const CORRIDORS: [string, string][] = [
  ['delhi', 'jaipur'], ['delhi', 'chandigarh'], ['delhi', 'agra'], ['delhi', 'dehradun'], ['delhi', 'amritsar'],
  ['delhi', 'ludhiana'], ['gurugram', 'jaipur'], ['gurugram', 'chandigarh'], ['noida', 'agra'], ['noida', 'dehradun'],
  ['chandigarh', 'shimla'], ['chandigarh', 'amritsar'], ['chandigarh', 'ludhiana'], ['chandigarh', 'dehradun'],
  ['ludhiana', 'amritsar'], ['jaipur', 'agra'], ['delhi', 'shimla'], ['gurugram', 'agra'],
];

/** Rough road fare: ~₹2.2 per km per seat, rounded to ₹10, in paise and within the allowed ₹50-₹5,000. */
function fare(a: Place, b: Place): number {
  const rupees = Math.round((haversineKm(a, b) * 1.25 * 2.2) / 10) * 10;
  return Math.min(500000, Math.max(5000, rupees * 100));
}

function must<T>(res: { ok: true; data: T } | { ok: false; message: string }, what: string): T {
  if (!res.ok) throw new Error(`${what}: ${res.message}`);
  return res.data;
}

async function reset(): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

type Person = { id: string; name: string; email: string };

async function createUsers(): Promise<{ driver: Person; passenger: Person; admin: Person; others: Person[] }> {
  const phones = new Set<string>();
  const phone = () => {
    for (;;) {
      const p = `${pick(['9', '8', '7', '6'])}${String(int(0, 999999999)).padStart(9, '0')}`;
      if (!phones.has(p)) {
        phones.add(p);
        return p;
      }
    }
  };
  async function make(name: string, email: string, role?: 'ADMIN'): Promise<Person> {
    const res = await signUp({ name, email, password: DEMO_PASSWORD, phone: phone() });
    const { id } = must(res, `signUp ${email}`);
    if (role) await db.user.update({ where: { id }, data: { role } });
    return { id, name, email };
  }
  const driver = await make('Rohan Mehta', 'driver@demo.test');
  const passenger = await make('Ananya Sharma', 'passenger@demo.test');
  const admin = await make('Admin Kapoor', 'admin@demo.test', 'ADMIN');

  const others: Person[] = [];
  const used = new Set(['Rohan Mehta', 'Ananya Sharma']);
  while (others.length < 27) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (used.has(name)) continue;
    used.add(name);
    const slug = name.toLowerCase().replace(/ /g, '.');
    others.push(await make(name, `${slug}@example.com`));
  }
  // A few verified drivers and bios make profiles look lived-in.
  for (const p of others.slice(0, 8)) {
    await db.user.update({ where: { id: p.id }, data: { idVerified: true, bio: 'Regular commuter between the northern cities.' } });
  }
  return { driver, passenger, admin, others };
}

async function insertPastTrip(t: {
  driverId: string;
  vehicleId: string;
  from: Place;
  to: Place;
  departureAt: Date;
  seatsTotal: number;
  seatsAvailable: number;
  pricePerSeat: number;
}): Promise<string> {
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO "Trip" ("id","driverId","vehicleId","originLabel","originPoint","destLabel","destPoint",
      "departureAt","seatsTotal","seatsAvailable","pricePerSeat","status")
    VALUES (${id}, ${t.driverId}, ${t.vehicleId}, ${t.from.label},
      ST_SetSRID(ST_MakePoint(${t.from.lng}, ${t.from.lat}),4326)::geography,
      ${t.to.label},
      ST_SetSRID(ST_MakePoint(${t.to.lng}, ${t.to.lat}),4326)::geography,
      ${t.departureAt}, ${t.seatsTotal}, ${t.seatsAvailable}, ${t.pricePerSeat}, 'COMPLETED'::"TripStatus")`;
  return id;
}

async function insertPastBooking(b: {
  tripId: string;
  passengerId: string;
  seats: number;
  pricePerSeat: number;
  status: Extract<BookingStatus, 'COMPLETED' | 'CANCELLED' | 'REJECTED'>;
  departureAt: Date;
}): Promise<void> {
  const amount = b.seats * b.pricePerSeat;
  const cancelledBy: CancelledBy | null = b.status === 'CANCELLED' ? 'PASSENGER' : null;
  await db.booking.create({
    data: {
      tripId: b.tripId,
      passengerId: b.passengerId,
      seats: b.seats,
      amount,
      status: b.status,
      cancelledBy,
      // Passenger cancelled an accepted booking > 24h out: full refund.
      refundAmount: b.status === 'CANCELLED' ? amount : 0,
      createdAt: new Date(b.departureAt.getTime() - 3 * DAY_MS),
    },
  });
}

async function main() {
  await reset();
  const { driver, passenger, admin, others } = await createUsers();
  const everyone = [driver, passenger, admin, ...others];

  // ~15 drivers: the demo driver plus 14 others, one car each.
  const drivers: { person: Person; vehicleId: string; seats: number }[] = [];
  for (const person of [driver, ...others.slice(0, 14)]) {
    const car = pick(CARS);
    const v = await createVehicle(person.id, { ...car, color: pick(COLOURS), seats: car.seats });
    drivers.push({ person, vehicleId: v.id, seats: v.seats });
  }
  const demoDriver = drivers[0];
  const riders = [passenger, ...others.slice(14), ...others.slice(0, 14)]; // everyone but driver/admin
  const otherRiders = riders.filter((r) => r.id !== passenger.id);

  const stats = { users: everyone.length, vehicles: drivers.length, pastTrips: 0, futureTrips: 0, bookings: {} as Record<string, number> };
  const count = (s: string) => (stats.bookings[s] = (stats.bookings[s] ?? 0) + 1);

  // ---- past trips (direct insert, COMPLETED) with COMPLETED/CANCELLED/REJECTED bookings -----------------
  const PAST_TRIPS = 30;
  for (let i = 0; i < PAST_TRIPS; i++) {
    // The first three belong to the demo driver; the demo passenger rides on the first few.
    const d = i < 3 ? demoDriver : pick(drivers);
    const [a, b] = pick(CORRIDORS);
    const [fromSlug, toSlug] = chance(0.5) ? [a, b] : [b, a];
    const from = city(fromSlug);
    const to = city(toSlug);
    const departureAt = istInstant(-int(2, 45), pick(HOURS), pick([0, 15, 30, 45]));
    const seatsTotal = int(2, d.seats);
    const pricePerSeat = fare(from, to);

    // The demo passenger has completed rides on the first few past trips.
    const crowd = otherRiders.filter((r) => r.id !== d.person.id).sort(() => rand() - 0.5);
    const shuffled = [...(i < 4 ? [passenger] : []), ...crowd].slice(0, int(i < 4 ? 2 : 1, Math.min(3, seatsTotal)));
    const planned = shuffled.map((p) => ({
      p,
      seats: 1,
      status: (p.id === passenger.id || chance(0.8) ? 'COMPLETED' : pick(['CANCELLED', 'REJECTED'] as const)) as 'COMPLETED' | 'CANCELLED' | 'REJECTED',
    }));
    const taken = planned.filter((x) => x.status === 'COMPLETED').reduce((n, x) => n + x.seats, 0);
    const tripId = await insertPastTrip({
      driverId: d.person.id,
      vehicleId: d.vehicleId,
      from,
      to,
      departureAt,
      seatsTotal,
      seatsAvailable: seatsTotal - taken,
      pricePerSeat,
    });
    stats.pastTrips++;
    for (const x of planned) {
      await insertPastBooking({ tripId, passengerId: x.p.id, seats: x.seats, pricePerSeat, status: x.status, departureAt });
      count(x.status);
    }
  }

  // ---- future trips via publishTrip (>= 3h ahead; days 1-14 IST at 05:00+ is always >= 5h) ----------------
  type Future = { id: string; driverId: string; seats: number };
  const future: Future[] = [];
  async function publish(d: (typeof drivers)[number], from: Place, to: Place, day: number, hour: number, seats: number) {
    const res = await publishTrip(d.person.id, {
      origin: from,
      dest: to,
      departureAt: istInstant(day, hour, pick([0, 15, 30, 45])),
      vehicleId: d.vehicleId,
      seats: Math.min(seats, d.seats),
      pricePerSeat: fare(from, to),
      notes: chance(NOTE_PROB) ? pick(NOTES) : undefined,
    });
    const { id } = must(res, 'publishTrip');
    future.push({ id, driverId: d.person.id, seats: Math.min(seats, d.seats) });
    stats.futureTrips++;
    return id;
  }

  // Demo driver: 6 upcoming trips out of/into Delhi.
  const demoRoutes: [string, string][] = [
    ['delhi', 'jaipur'], ['jaipur', 'delhi'], ['delhi', 'chandigarh'], ['delhi', 'agra'], ['delhi', 'dehradun'], ['chandigarh', 'shimla'],
  ];
  const demoTripIds: string[] = [];
  for (const [i, [a, b]] of demoRoutes.entries()) {
    demoTripIds.push(await publish(demoDriver, city(a), city(b), i + 1, pick(HOURS.filter((h) => h >= 6)), 4));
  }
  const FUTURE_TRIPS = 50;
  for (let i = 0; i < FUTURE_TRIPS; i++) {
    const d = pick(drivers.slice(1));
    const [a, b] = pick(CORRIDORS);
    const [fromSlug, toSlug] = chance(0.5) ? [a, b] : [b, a];
    await publish(d, city(fromSlug), city(toSlug), int(1, 14), pick(HOURS), int(2, d.seats));
  }

  // ---- future bookings through requestBooking + transition ----------------------------------------------
  const actorDriver = (id: string) => ({ userId: id, kind: 'DRIVER' as const });
  const actorPax = (id: string) => ({ userId: id, kind: 'PASSENGER' as const });

  async function book(
    t: Future,
    who: Person,
    outcome: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
    seats = 1,
  ): Promise<boolean> {
    const req = await requestBooking(who.id, t.id, seats);
    if (!req.ok) return false; // e.g. TRIP_FULL: skip quietly
    const { bookingId } = req.data;
    if (outcome === 'ACCEPTED') must(await transition(bookingId, 'ACCEPT', actorDriver(t.driverId)), 'accept');
    if (outcome === 'REJECTED') must(await transition(bookingId, 'REJECT', actorDriver(t.driverId)), 'reject');
    if (outcome === 'CANCELLED') must(await transition(bookingId, 'CANCEL', actorPax(who.id)), 'cancel');
    count(outcome);
    return true;
  }

  const byId = new Map(future.map((t) => [t.id, t]));
  // Demo driver: pending requests on every upcoming trip, one accepted on the first.
  const pool = otherRiders.filter((r) => r.id !== driver.id);
  for (const [i, id] of demoTripIds.entries()) {
    const t = byId.get(id)!;
    await book(t, pool[i * 2], 'REQUESTED');
    if (i % 2 === 0) await book(t, pool[i * 2 + 1], 'REQUESTED');
    if (i === 0) await book(t, pool[12], 'ACCEPTED');
  }

  // Demo passenger: one ACCEPTED and one REQUESTED (other drivers), plus a rejected and a cancelled one.
  const others4 = future.filter((t) => t.driverId !== driver.id && t.driverId !== passenger.id);
  await book(others4[0], passenger, 'ACCEPTED', 1);
  await book(others4[1], passenger, 'REQUESTED', 2);
  await book(others4[2], passenger, 'REJECTED', 1);
  await book(others4[3], passenger, 'CANCELLED', 1);

  // Everyone else: a random mix across the remaining trips.
  const mix = ['REQUESTED', 'REQUESTED', 'REQUESTED', 'ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
  for (const t of future.slice(demoTripIds.length)) {
    const n = chance(0.3) ? 0 : int(1, 2);
    const who = otherRiders.filter((r) => r.id !== t.driverId).sort(() => rand() - 0.5).slice(0, n);
    for (const p of who) await book(t, p, pick(mix), 1);
  }

  console.log('Seed complete:');
  console.log(`  users: ${stats.users} (demo: driver@, passenger@, admin@demo.test / ${DEMO_PASSWORD})`);
  console.log(`  vehicles: ${stats.vehicles}`);
  console.log(`  trips: ${stats.pastTrips + stats.futureTrips} (${stats.pastTrips} past, ${stats.futureTrips} upcoming)`);
  console.log(`  bookings: ${JSON.stringify(stats.bookings)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
