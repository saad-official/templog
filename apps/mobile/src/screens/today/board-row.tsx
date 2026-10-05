import { Pressable } from 'react-native';

import { CheckpointRow, checkpointRowLabel } from '@/components/checkpoint-row';
import { haptics } from '@/native/haptics';

import { openCheckFor, openLog } from './board-actions';
import type { BoardRowProps } from './board-row.types';

/** Tap logs a reading; long press opens Snooze / History (Android action sheet). */
export function BoardRow({ item, row, onLongPress }: BoardRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={checkpointRowLabel(row)}
      accessibilityHint="Opens the keypad to log a reading. Long press for more"
      onPress={() => openLog(item.checkpoint.id, openCheckFor(item))}
      onLongPress={
        onLongPress
          ? () => {
              haptics.selection();
              onLongPress(item);
            }
          : undefined
      }
    >
      {({ pressed }) => <CheckpointRow {...row} pressed={pressed} />}
    </Pressable>
  );
}
