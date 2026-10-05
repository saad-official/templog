import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { CheckpointRow, checkpointRowLabel } from '@/components/checkpoint-row';
import { kindIcons } from '@/constants/icons';

import { openCheckFor, openHistory, openLog, snooze } from './board-actions';
import type { BoardRowProps } from './board-row.types';

/** Tap logs a reading; press and hold for Snooze 15 / History (native context menu). */
export function BoardRow({ item, row }: BoardRowProps) {
  const scheduledFor = openCheckFor(item);
  const open = item.current && (item.current.state === 'due' || item.current.state === 'overdue') ? item.current : null;
  const params = scheduledFor ? { checkpointId: item.checkpoint.id, scheduledFor } : { checkpointId: item.checkpoint.id };
  return (
    <Link href={{ pathname: '/log/[checkpointId]', params }} asChild>
      <Link.Trigger>
        <Pressable accessibilityLabel={checkpointRowLabel(row)} accessibilityHint="Opens the keypad to log a reading. Press and hold for more">
          {({ pressed }) => <CheckpointRow {...row} pressed={pressed} />}
        </Pressable>
      </Link.Trigger>
      <Link.Menu title={item.checkpoint.name}>
        {open ? <Link.MenuAction title="Snooze 15 minutes" icon="moon.zzz" onPress={() => snooze([open.check.id])} /> : null}
        <Link.MenuAction title="Log a reading" icon={kindIcons[item.checkpoint.kind].sf} onPress={() => openLog(item.checkpoint.id, scheduledFor)} />
        <Link.MenuAction title="History" icon="calendar" onPress={() => openHistory(item.checkpoint.id)} />
      </Link.Menu>
    </Link>
  );
}
