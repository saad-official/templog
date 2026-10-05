import type { CheckpointRowProps } from '@/components/checkpoint-row';
import type { CheckpointBoardItem } from '@/data';

export type BoardRowProps = {
  item: CheckpointBoardItem;
  row: Omit<CheckpointRowProps, 'pressed'>;
  /** Android: long press opens the action sheet (iOS uses a native context menu). */
  onLongPress?: (item: CheckpointBoardItem) => void;
};
