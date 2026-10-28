# Hand-maintained SQL objects

Prisma cannot express these, so they live only in the `init` migration. `prisma migrate dev` may generate statements that drop them (it does for the GiST indexes). Always use `--create-only`, review the SQL, and delete any such statements.

- `trip_origin_gix`, `trip_dest_gix`: GiST indexes on `Trip.originPoint` / `destPoint` (`migrate diff` wants to drop these).
- `trip_seats_chk`: CHECK `0 <= seatsAvailable <= seatsTotal` on `Trip`.
- `booking_one_active_per_passenger`: partial unique index on `Booking(tripId, passengerId)` where status is PENDING_PAYMENT, REQUESTED or ACCEPTED.
- `CREATE EXTENSION IF NOT EXISTS postgis;` at the top of the init migration.

`trip_status_departure_idx` is declared in `schema.prisma` and is not hand-maintained.
