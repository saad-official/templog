import type { ReactNode } from 'react';
import { View } from 'react-native';

import { spacing } from '@/theme';

import { AppText } from './app-text';

/** A section title above a group, with an optional trailing element (count badge, action). */
export function SectionHeader({ title, trailing, inset = true }: { title: string; trailing?: ReactNode; inset?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.xs,
        paddingHorizontal: inset ? spacing.md : 0,
        marginBottom: -spacing.xs,
      }}
    >
      <AppText variant="callout" tone="secondary" weight="600" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {trailing}
    </View>
  );
}
