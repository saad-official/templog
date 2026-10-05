// Onboarding artwork built from views (no image assets), so it follows the theme and Dynamic Type.
// Example readings are derived from the shared Food Code defaults, never typed in as numbers.
import { COOLING_LIMITS, formatMinutes } from '@templog/shared/cooling';
import { FOOD_CODE_DEFAULTS } from '@templog/shared/limits';
import { displayTemp, formatTemp, type Unit } from '@templog/shared/units';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { KindIcon } from '@/components/kind-icon';
import { ResultStamp } from '@/components/result-stamp';
import { icons } from '@/constants/icons';
import { buildAppTheme, radius, spacing, useTheme, withAlpha } from '@/theme';

const COLD_MAX = FOOD_CODE_DEFAULTS['cold-holding'].max ?? 0;
const HOT_MIN = FOOD_CODE_DEFAULTS['hot-holding'].min ?? 0;

const t = (valueF: number, unit: Unit) => formatTemp(displayTemp(valueF, unit), unit);

/** Page 1: a log sheet with a pass, a pass and a fail with its corrective action. */
export function LogSheetArt({ unit }: { unit: Unit }) {
  const { colors, shadow } = useTheme();
  const rows = [
    { name: 'Walk-in cooler', kind: 'cold-holding' as const, value: t(COLD_MAX - 3, unit), result: 'pass' as const, meta: '8:00 AM · SK' },
    { name: 'Hot well', kind: 'hot-holding' as const, value: t(HOT_MIN + 6, unit), result: 'pass' as const, meta: '8:04 AM · SK' },
    { name: 'Reach-in fridge', kind: 'cold-holding' as const, value: t(COLD_MAX + 4, unit), result: 'fail' as const, meta: 'Moved product · JR' },
  ];
  return (
    <View
      accessible
      accessibilityLabel="Example log: three readings with initials, one fail with its corrective action"
      style={{ width: 300, backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.sm, boxShadow: shadow('md') }}
    >
      {rows.map((r) => (
        <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <KindIcon kind={r.kind} size={32} />
          <View style={{ flex: 1 }}>
            <AppText variant="callout" weight="600" numberOfLines={1}>
              {r.name}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {r.meta}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <AppText variant="callout" weight="700" tabular style={{ color: r.result === 'fail' ? colors.heatText : colors.text }}>
              {r.value}
            </AppText>
            <ResultStamp result={r.result} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Page 2: a cooling Live Activity on a dark Lock Screen. */
export function CoolingActivityArt({ unit }: { unit: Unit }) {
  const { colors } = useTheme();
  // The Lock Screen is dark in both themes: paint it from the dark palette.
  const dark = buildAppTheme('dark').colors;
  const lock = { bg: dark.surfaceSunken, text: dark.text, secondary: dark.textSecondary };
  return (
    <View
      accessible
      accessibilityLabel={`Example Lock Screen timer: chili, stage 1, at most ${t(COOLING_LIMITS.stage1MaxF, unit)} in ${formatMinutes(72)}`}
      style={{ width: 312, backgroundColor: lock.bg, borderRadius: radius.lg + 6, borderCurve: 'continuous', padding: spacing.md, gap: spacing.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.heat, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icons.cooling} size={16} color={colors.onHeat} weight="bold" />
        </View>
        <AppText variant="callout" weight="700" style={{ color: lock.text, flex: 1 }}>
          Chili · Stage 1
        </AppText>
        <AppText variant="headline" tabular style={{ color: colors.heat }}>
          1:12
        </AppText>
      </View>
      <AppText variant="caption" style={{ color: lock.secondary }}>
        {`≤ ${t(COOLING_LIMITS.stage1MaxF, unit)} within ${COOLING_LIMITS.stage1Hours} h · then ≤ ${t(COOLING_LIMITS.stage2MaxF, unit)} by ${COOLING_LIMITS.totalHours} h`}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={{ flex: COOLING_LIMITS.stage1Hours, height: 6, borderRadius: 3, backgroundColor: withAlpha(colors.heat, 0.25), overflow: 'hidden' }}>
          <View style={{ width: '40%', height: 6, backgroundColor: colors.heat }} />
        </View>
        <View style={{ flex: COOLING_LIMITS.totalHours - COOLING_LIMITS.stage1Hours, height: 6, borderRadius: 3, backgroundColor: withAlpha(lock.secondary, 0.25) }} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <View style={{ flex: 1, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.heat, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" weight="700" style={{ color: colors.onHeat }}>
            Log reading
          </AppText>
        </View>
        <View style={{ flex: 1, minHeight: 36, borderRadius: radius.pill, backgroundColor: withAlpha(lock.text, 0.14), alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" weight="700" style={{ color: lock.text }}>
            Discarded
          </AppText>
        </View>
      </View>
    </View>
  );
}

function TapBadge({ n }: { n: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="caption" weight="700" style={{ color: colors.onAction }}>
        {String(n)}
      </AppText>
    </View>
  );
}

/** Page 3: tap the checkpoint, type, Save. */
export function TwoTapsArt({ unit }: { unit: Unit }) {
  const { colors, shadow } = useTheme();
  return (
    <View accessible accessibilityLabel="Tap the checkpoint, type the reading, tap Save" style={{ width: 300, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.sm, boxShadow: shadow('sm') }}>
        <KindIcon kind="cold-holding" size={32} />
        <AppText variant="callout" weight="600" style={{ flex: 1 }}>
          Walk-in cooler
        </AppText>
        <TapBadge n={1} />
      </View>
      <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, alignItems: 'center', boxShadow: shadow('sm') }}>
        <AppText variant="display" tabular style={{ color: colors.passText }}>
          {formatTemp(displayTemp(COLD_MAX - 3, unit), unit).split(' ')[0]}
          <AppText variant="headline" tone="secondary">{` °${unit}`}</AppText>
        </AppText>
        <ResultStamp result="pass" />
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="callout" weight="700" style={{ color: colors.onAction }}>
              Save reading
            </AppText>
          </View>
          <TapBadge n={2} />
        </View>
      </View>
    </View>
  );
}
