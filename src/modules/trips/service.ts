import { randomUUID } from 'node:crypto';
import type { Trip, Vehicle } from '@prisma/client';
import { db } from '@/lib/db';
import { err, ok, type Result } from '@/lib/result';
import type { Place } from '@/modules/geo/cities';
import { haversineKm, route } from '@/modules/geo/service';

export type PublishTripInput = {
  origin: Place;
  dest: Place;
  departureAt: Date;
  vehicleId: string;
  seats: number;
  /** paise */
  pricePerSeat: number;
  notes?: string;
};

export type TripView = Omit<Trip, 'distanceKm'> & {
  driver: { id: string; name: string | null; image: string | null; ratingAvg: number; ratingCount: number };
  vehicle: Vehicle;
  origin: Place;
  dest: Place;
  distanceKm: number;
};

const MIN_LEAD_MS = 2 * 60 * 60 * 1000;
const MIN_PRICE = 5000;
const MAX_PRICE = 500000;
const MAX_NOTES = 500;

export async function publishTrip(
  driverId: string,
  input: PublishTripInput,
  now: Date = new Date(),
): Promise<Result<{ id: string }>> {
  if (!(input.departureAt.getTime() >= now.getTime() + MIN_LEAD_MS)) {
    return err('VALIDATION', 'Departure must be at least 2 hours from now');
  }
  if (!Number.isInteger(input.pricePerSeat) || input.pricePerSeat < MIN_PRICE || input.pricePerSeat > MAX_PRICE) {
    return err('VALIDATION', 'Price per seat must be between ₹50 and ₹5,000');
  }
  if (input.origin.lat === input.dest.lat && input.origin.lng === input.dest.lng) {
    return err('VALIDATION', 'Pick different start and end points');
  }
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > MAX_NOTES) return err('VALIDATION', 'Notes are too long (500 characters max)');

  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: driverId },
    select: { seats: true },
  });
  if (!vehicle) return err('NOT_ALLOWED', 'You can only publish trips with your own car');
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > vehicle.seats) {
    return err('VALIDATION', `Seats must be between 1 and your car's ${vehicle.seats} passenger seats`);
  }

  const routed = await route(input.origin, input.dest);
  const id = randomUUID();
  const { origin, dest } = input;

  // Points are an Unsupported() column, so Prisma cannot create the row; insert it with raw SQL in one transaction.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Trip" ("id","driverId","vehicleId","originLabel","originPoint","destLabel","destPoint",
        "routePolyline","distanceKm","durationMin","departureAt","seatsTotal","seatsAvailable","pricePerSeat",
        "status","notes")
      VALUES (${id}, ${driverId}, ${input.vehicleId}, ${origin.label},
        ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}),4326)::geography,
        ${dest.label},
        ST_SetSRID(ST_MakePoint(${dest.lng}, ${dest.lat}),4326)::geography,
        ${routed?.polyline ?? null}, ${routed?.distanceKm ?? null}, ${routed?.durationMin ?? null},
        ${input.departureAt}, ${input.seats}, ${input.seats}, ${input.pricePerSeat},
        'PUBLISHED'::"TripStatus", ${notes})`;
  });
  return ok({ id });
}

/** The plain Trip row (no points or relations), or null. */
export async function findTripRow(id: string): Promise<Trip | null> {
  return db.trip.findUnique({ where: { id } });
}

type PointRow = { oLat: number; oLng: number; dLat: number; dLng: number };

export async function getTrip(id: string): Promise<TripView | null> {
  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      driver: { select: { id: true, name: true, image: true, ratingAvg: true, ratingCount: true } },
      vehicle: true,
    },
  });
  if (!trip) return null;
  const [pts] = await db.$queryRaw<PointRow[]>`
    SELECT ST_Y("originPoint"::geometry) AS "oLat", ST_X("originPoint"::geometry) AS "oLng",
           ST_Y("destPoint"::geometry) AS "dLat", ST_X("destPoint"::geometry) AS "dLng"
    FROM "Trip" WHERE "id" = ${id}`;
  if (!pts) return null;
  const origin = { label: trip.originLabel, lat: pts.oLat, lng: pts.oLng };
  const dest = { label: trip.destLabel, lat: pts.dLat, lng: pts.dLng };
  return {
    ...trip,
    driver: { ...trip.driver, ratingAvg: Number(trip.driver.ratingAvg) },
    origin,
    dest,
    distanceKm: trip.distanceKm ?? Math.round(haversineKm(origin, dest)),
  };
}
