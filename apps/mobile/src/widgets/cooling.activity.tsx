// iOS Live Activity for one cooling timer (Lock Screen banner + Dynamic Island).
//
// The function marked 'widget' is stringified at build time and evaluated in the widget extension's
// isolated runtime: only @expo/ui/swift-ui components/modifiers (unaliased imports), its props and
// the environment. No hooks, no app imports, no outer-scope constants. The countdown and progress
// bar are native SwiftUI timers (`timerInterval`), so they keep moving while the app is suspended.
// "Log reading" is a Link (opens `templog://cooling/<id>`); "Discarded" is a Button whose target
// `discarded:<id>` reaches `addUserInteractionListener` (see live-status.ios.ts).
import { Button, HStack, Image, Link, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type CoolingActivityColors = {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  warning: string;
};

export type CoolingActivityProps = {
  itemId: string;
  /** "Chili (6 qt)". */
  name: string;
  /** "Stage 1 · ≤ 70 °F". */
  stageLabel: string;
  /** Locale-formatted deadline, e.g. "4:15 PM". */
  dueLabel: string;
  stageStartMs: number;
  dueAtMs: number;
  /** `templog://cooling/<itemId>`. */
  url: string;
  palette: { light: CoolingActivityColors; dark: CoolingActivityColors };
};

const CoolingActivity = (props: CoolingActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.palette.dark : props.palette.light;
  const timer = { lower: new Date(props.stageStartMs), upper: new Date(props.dueAtMs) };
  const stale = environment.isStale === true;
  const countdown = (size: number) =>
    stale ? (
      <Text modifiers={[font({ size, weight: 'semibold' }), foregroundStyle(c.warning)]}>Overdue</Text>
    ) : (
      <Text
        timerInterval={timer}
        countsDown
        modifiers={[font({ size, weight: 'semibold' }), monospacedDigit(), foregroundStyle(c.accentText)]}
      />
    );

  const buttons = (
    <HStack spacing={10}>
      <Link destination={props.url} modifiers={[tint(c.accent)]}>
        <HStack spacing={4}>
          <Image systemName="thermometer.medium" color={c.accent} />
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(c.accent)]}>Log reading</Text>
        </HStack>
      </Link>
      <Spacer />
      <Button
        target={`discarded:${props.itemId}`}
        label="Discarded"
        systemImage="trash"
        role="destructive"
        modifiers={[foregroundStyle(c.textSecondary)]}
      />
    </HStack>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), activityBackgroundTint(c.surface)]}>
        <HStack spacing={10}>
          <Image systemName="snowflake" color={c.accent} size={26} />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(1), foregroundStyle(c.text)]}>{props.name}</Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(c.textSecondary)]}>{`${props.stageLabel} by ${props.dueLabel}`}</Text>
          </VStack>
          <Spacer />
          {countdown(22)}
        </HStack>
        <ProgressView timerInterval={timer} countsDown={false} modifiers={[tint(stale ? c.warning : c.accent)]} />
        {buttons}
      </VStack>
    ),
    compactLeading: <Image systemName="snowflake" color={c.accent} />,
    compactTrailing: stale ? (
      <Image systemName="exclamationmark.triangle.fill" color={c.warning} />
    ) : (
      <Text timerInterval={timer} countsDown modifiers={[monospacedDigit(), frame({ width: 56 }), foregroundStyle(c.accent)]} />
    ),
    minimal: <Image systemName="snowflake" color={c.accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 4 })]}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{props.name}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(c.accent)]}>{props.stageLabel}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 4 })]}>
        {countdown(22)}
        <Text modifiers={[font({ size: 12 })]}>{`by ${props.dueLabel}`}</Text>
      </VStack>
    ),
    expandedBottom: (
      <VStack spacing={8}>
        <ProgressView timerInterval={timer} countsDown={false} modifiers={[tint(stale ? c.warning : c.accent)]} />
        {buttons}
      </VStack>
    ),
  };
};

export default createLiveActivity<CoolingActivityProps>('Cooling', CoolingActivity);
