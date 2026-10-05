// iOS home-screen / Lock Screen widget `NextCheck`: the next temperature check (name, time,
// countdown) and today's compliance %. accessoryCircular shows minutes to the next check.
//
// The function marked 'widget' is stringified at build time and evaluated in the widget extension's
// isolated runtime: it may only use @expo/ui/swift-ui components/modifiers (keep the imported names
// unaliased), its props and the environment. No hooks, no app imports, no outer-scope constants.
// Props are JSON, so instants travel as epoch milliseconds.
import { AccessoryWidgetBackground, Gauge, HStack, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type NextCheckWidgetColors = {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  pass: string;
  warning: string;
  track: string;
};

export type NextCheckWidgetProps = {
  checkpointName: string | null;
  /** `templog://log/<checkpointId>` for the next check, else `templog://today`. */
  url: string;
  dueAtMs: number | null;
  /** Locale-formatted check time, e.g. "2:00 PM". */
  dueLabel: string | null;
  /** State at the entry date: 'due' | 'overdue' | 'upcoming' | null. */
  state: string | null;
  /** Today's compliance so far, 0…100, or null before anything was due. */
  compliancePct: number | null;
  logged: number;
  scheduled: number;
  palette: { light: NextCheckWidgetColors; dark: NextCheckWidgetColors };
};

const NextCheckWidget = (props: NextCheckWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.palette.dark : props.palette.light;
  const family = environment.widgetFamily;
  const hasNext = props.checkpointName != null && props.dueAtMs != null;
  const due = hasNext ? new Date(props.dueAtMs as number) : null;
  const minutes = due ? Math.ceil((due.getTime() - environment.date.getTime()) / 60000) : null;
  const late = props.state === 'overdue' || (minutes != null && minutes < 0);
  const pct = props.compliancePct;
  const pctLabel = pct == null ? '–' : `${pct}%`;
  const stateColor = late ? c.accentText : props.state === 'due' ? c.warning : c.textSecondary;
  const whenLabel = minutes == null ? '' : late ? 'overdue' : minutes <= 0 ? 'due now' : minutes < 60 ? `in ${minutes} min` : `at ${props.dueLabel ?? ''}`;

  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {hasNext ? `${props.checkpointName} · ${whenLabel}` : `Templog · ${pctLabel} today`}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    const value = minutes == null ? 0 : Math.max(0, Math.min(60, minutes)) / 60;
    return (
      <ZStack modifiers={[widgetURL(props.url)]}>
        <AccessoryWidgetBackground />
        <Gauge
          value={value}
          min={0}
          max={1}
          currentValueLabel={
            <Text modifiers={[font({ size: 15, weight: 'semibold' }), monospacedDigit(), minimumScaleFactor(0.6)]}>
              {minutes == null ? '–' : late || minutes <= 0 ? 'now' : minutes >= 100 ? `${Math.round(minutes / 60)}h` : `${minutes}m`}
            </Text>
          }
          modifiers={[gaugeStyle('circularCapacity')]}
        />
      </ZStack>
    );
  }

  const nextBlock = hasNext ? (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(2), minimumScaleFactor(0.7), foregroundStyle(c.text)]}>
        {props.checkpointName ?? ''}
      </Text>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 13, weight: 'medium' }), monospacedDigit(), foregroundStyle(c.text)]}>{props.dueLabel ?? ''}</Text>
        <Text modifiers={[font({ size: 13 }), lineLimit(1), foregroundStyle(stateColor)]}>{whenLabel}</Text>
      </HStack>
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle(c.text)]}>All logged</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(c.textSecondary)]}>No more checks today</Text>
    </VStack>
  );

  const ring = (
    <Gauge
      value={pct == null ? 0 : pct / 100}
      min={0}
      max={1}
      currentValueLabel={<Text modifiers={[font({ size: 12, weight: 'semibold' }), monospacedDigit()]}>{pctLabel}</Text>}
      modifiers={[gaugeStyle('circularCapacity'), tint(pct != null && pct < 100 ? c.accent : c.pass)]}
    />
  );

  if (family === 'systemMedium') {
    return (
      <HStack spacing={16} modifiers={[padding({ all: 4 }), containerBackground(c.surface, 'widget'), widgetURL(props.url)]}>
        <VStack alignment="leading" spacing={6}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(late ? c.accentText : c.textSecondary)]}>
            {late ? 'OVERDUE CHECK' : 'NEXT CHECK'}
          </Text>
          {nextBlock}
        </VStack>
        <Spacer />
        <VStack alignment="center" spacing={4}>
          {ring}
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>{`${props.logged}/${props.scheduled} today`}</Text>
        </VStack>
      </HStack>
    );
  }

  // systemSmall
  return (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 2 }), containerBackground(c.surface, 'widget'), widgetURL(props.url)]}>
      <HStack>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(late ? c.accentText : c.textSecondary)]}>
          {late ? 'OVERDUE' : 'NEXT CHECK'}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), monospacedDigit(), foregroundStyle(c.textSecondary)]}>{pctLabel}</Text>
      </HStack>
      {nextBlock}
      <Spacer />
    </VStack>
  );
};

export default createWidget<NextCheckWidgetProps>('NextCheck', NextCheckWidget);
