import { Share, View } from 'react-native';

import { spelled } from '@/constants/format';
import { icons } from '@/constants/icons';
import { SITE_URL } from '@/constants/links';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { PrimaryButton } from './primary-button';

/** The shared kitchen's join code, big enough to read across a pass, with a Share action. */
export function JoinCodeCard({ code, kitchenName }: { code: string; kitchenName: string }) {
  const { colors } = useTheme();
  const share = () => {
    haptics.selection();
    Share.share({
      message: `Join ${kitchenName} on Templog to log temperatures together. Install Templog (${SITE_URL}), open Settings › Team › Join with a code and enter ${code}.`,
    }).catch(() => undefined);
  };
  return (
    <View
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.lg,
        gap: spacing.md,
        alignItems: 'center',
      }}
    >
      <AppText variant="callout" tone="secondary" weight="600">
        Join code
      </AppText>
      <View style={{ backgroundColor: colors.fill, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <AppText variant="display" selectable accessibilityLabel={`Join code ${spelled(code)}`} style={{ letterSpacing: 6 }}>
          {code}
        </AppText>
      </View>
      <AppText variant="callout" tone="secondary" align="center">
        Staff enter this in Templog under Settings › Team › Join with a code.
      </AppText>
      <PrimaryButton title="Share code" icon={icons.share} onPress={share} />
    </View>
  );
}
