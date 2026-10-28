import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { TZ } from '@/lib/time';

const label = (missing: string) => z.string().trim().min(1, missing).max(120);
const lat = (missing: string) => z.coerce.number({ error: missing }).min(-90).max(90);
const lng = (missing: string) => z.coerce.number({ error: missing }).min(-180).max(180);

/** Publish form values (all strings). Date and time are Asia/Kolkata wall-clock; price is in rupees. */
export const publishFormSchema = z
  .object({
    originLabel: label('Choose a starting point'),
    originLat: lat('Choose a starting point'),
    originLng: lng('Choose a starting point'),
    destLabel: label('Choose a destination'),
    destLat: lat('Choose a destination'),
    destLng: lng('Choose a destination'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time'),
    vehicleId: z.string().min(1, 'Choose a car'),
    seats: z.coerce.number({ error: 'Choose the number of seats' }).int('Seats must be a whole number'),
    price: z.coerce.number({ error: 'Enter a price per seat' }),
    notes: z.string().max(500, 'Notes are too long (500 characters max)').optional(),
  })
  .transform((v) => {
    const [y, m, d] = v.date.split('-').map(Number);
    const [hh, mm] = v.time.split(':').map(Number);
    return {
      origin: { label: v.originLabel, lat: v.originLat, lng: v.originLng },
      dest: { label: v.destLabel, lat: v.destLat, lng: v.destLng },
      departureAt: new Date(new TZDate(y, m - 1, d, hh, mm, TZ).getTime()),
      vehicleId: v.vehicleId,
      seats: v.seats,
      pricePerSeat: Math.round(v.price * 100),
      notes: v.notes,
    };
  });
