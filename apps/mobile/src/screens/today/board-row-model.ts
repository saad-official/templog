import { dayKeyOf } from '@templog/shared/tz';
import { displayTemp, formatTemp, type Unit } from '@templog/shared/units';

import type { CheckpointRowProps } from '@/components/checkpoint-row';
import { formatDayShort } from '@/constants/format';
import { type CheckpointBoardItem, formatClock } from '@/data';

/** Board item → CheckpointRow props (labels from the shared rules, times in the kitchen zone). */
export function boardRowModel(item: CheckpointBoardItem, unit: Unit, tz: string, todayKey: string): Omit<CheckpointRowProps, 'pressed'> {
  const r = item.latestReading;
  const current = item.current;
  const open = current && (current.state === 'due' || current.state === 'overdue');
  const snoozed = open && current.snoozedUntil;
  const readingDay = r ? dayKeyOf(r.takenAt, tz) : null;
  const readingTime = r ? formatClock(r.takenAt, tz) : '';

  let statusDetail: string | undefined;
  if (snoozed) statusDetail = `until ${formatClock(current.snoozedUntil!, tz)}`;
  else if (current && (item.status === 'overdue' || item.status === 'due' || item.status === 'upcoming')) statusDetail = formatClock(current.check.scheduledFor, tz);
  else if (item.status === 'done') statusDetail = `${item.loggedToday}/${item.scheduledToday}`;
  else if (item.status === 'missed') statusDetail = `${item.missedToday} today`;

  return {
    name: item.checkpoint.name,
    kind: item.checkpoint.kind,
    kindLabel: item.kindLabel,
    limitsLabel: item.limitsLabel,
    latest: r
      ? {
          valueLabel: formatTemp(displayTemp(r.valueF, unit), unit),
          result: r.result,
          time: readingDay && readingDay !== todayKey ? `${formatDayShort(readingDay)}, ${readingTime}` : readingTime,
          initials: r.initials,
        }
      : null,
    status: snoozed ? 'snoozed' : item.status,
    statusDetail,
  };
}
