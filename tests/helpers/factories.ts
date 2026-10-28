import { randomUUID } from 'node:crypto';
import type { Trip, TripStatus, User, Vehicle } from '@prisma/client';
import { db } from '@/lib/db';
import type { LatLng } from '@/modules/geo/cities';

let counter = 0;

export async function createUser(over: Partial<User> = {}): Promise<User> {
  counter += 1;
  return db.user.create({
    data: {
      name: `Test User ${counter}`,
      email: `user${counter}-${randomUUID().slice(0, 8)}@example.com`,
      ...over,
    },
  });
}

export async function createVehicle(
  ownerId: string,
  over: Partial<Omit<Vehicle, 'id' | 'ownerId'>> = {},
): Promise<Vehicle> {
  return db.vehicle.create({
    data: { ownerId, make: 'Maruti', model: 'Ertiga', color: 'White', seats: 4, ...over },
  });
}

export type CreateTripInput = {
  driverId?: string;
  vehicleId?: string;
  originLabel?: string;
  destLabel?: string;
  origin?: LatLng;
  dest?: LatLng;
  departureAt?: Date;
  seatsTotal?: number;
  seatsAvailable?: number;
  pricePerSeat?: number;
  status?: TripStatus;
};

const DELHI: LatLng = { lat: 28.6139, lng: 77.209 };
const JAIPUR: LatLng = { lat: 26.9124, lng: 75.7873 };

export async function createTrip(over: CreateTripInput = {}): Promise<Trip> {
  let driverId = over.driverId;
  let vehicleId = over.vehicleId;
  if (!driverId) driverId = (await createUser()).id;
  if (!vehicleId) vehicleId = (await createVehicle(driverId)).id;

  const origin = over.origin ?? DELHI;
  const dest = over.dest ?? JAIPUR;
  const departureAt = over.departureAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const seatsTotal = over.seatsTotal ?? 3;
  const seatsAvailable = over.seatsAvailable ?? seatsTotal;
  const pricePerSeat = over.pricePerSeat ?? 45000;
  const status = over.status ?? 'PUBLISHED';
  const id = randomUUID();

  await db.$executeRaw`
    INSERT INTO "Trip" ("id","driverId","vehicleId","originLabel","originPoint","destLabel","destPoint",
      "departureAt","seatsTotal","seatsAvailable","pricePerSeat","status")
    VALUES (${id}, ${driverId}, ${vehicleId}, ${over.originLabel ?? 'Delhi'},
      ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}),4326)::geography,
      ${over.destLabel ?? 'Jaipur'},
      ST_SetSRID(ST_MakePoint(${dest.lng}, ${dest.lat}),4326)::geography,
      ${departureAt}, ${seatsTotal}, ${seatsAvailable}, ${pricePerSeat}, ${status}::"TripStatus")`;

  return db.trip.findUniqueOrThrow({ where: { id } });
}
