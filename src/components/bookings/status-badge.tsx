import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, statusTone } from '@/modules/bookings/presentation';
import type { BookingStatus } from '@/modules/bookings/transitions';

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
