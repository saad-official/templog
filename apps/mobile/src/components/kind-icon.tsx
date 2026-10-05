import { checkpointTone } from '@templog/shared/limits';
import type { CheckpointKind } from '@templog/shared/schemas';
import { View } from 'react-native';

import { kindIcons } from '@/constants/icons';
import { radius, useTheme } from '@/theme';

import { Icon } from './icon';

/**
 * Checkpoint kind glyph on a soft well: cold blue for cold holding, freezers and receiving; amber
 * for hot holding and cooking (heat red stays reserved for fails and cooling timers).
 */
export function KindIcon({ kind, size = 40 }: { kind: CheckpointKind; size?: number }) {
  const { colors } = useTheme();
  const cold = checkpointTone(kind) === 'cold';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm + 2,
        borderCurve: 'continuous',
        backgroundColor: cold ? colors.coldSoft : colors.warningSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={kindIcons[kind]} size={Math.round(size * 0.5)} color={cold ? colors.coldText : colors.warningText} weight="semibold" />
    </View>
  );
}
