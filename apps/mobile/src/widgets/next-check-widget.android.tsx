'use no memo';
// Android home-screen widget `NextCheck` (react-native-android-widget), 2×2: next check + today's
// compliance ring. These components are called as plain functions to build a RemoteViews tree, so
// the React Compiler must stay off (above) and no hooks may be used. Never pass `null`/`false`
// children: the tree builder cannot skip them.
import { type ColorProp, FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

export const NEXT_CHECK_WIDGET_NAME = 'NextCheck';

export type AndroidWidgetColors = {
  surface: ColorProp;
  text: ColorProp;
  textSecondary: ColorProp;
  accent: ColorProp;
  accentText: ColorProp;
  pass: ColorProp;
  warning: ColorProp;
  track: ColorProp;
};

export type NextCheckWidgetAndroidProps = {
  checkpointName: string | null;
  /** "2:00 PM · in 25 min" / "1:00 PM · overdue". */
  subtitle: string;
  late: boolean;
  url: string;
  compliancePct: number | null;
  logged: number;
  scheduled: number;
  colors: AndroidWidgetColors;
};

function ring(pct: number | null, c: AndroidWidgetColors): string {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const share = pct == null ? 0 : Math.min(1, pct / 100);
  const dash = (share * circumference).toFixed(2);
  const stroke = pct != null && pct >= 100 ? c.pass : c.accent;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="${r}" fill="none" stroke="${c.track}" stroke-width="7"/>
  <circle cx="32" cy="32" r="${r}" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round"
    stroke-dasharray="${dash} ${circumference.toFixed(2)}" transform="rotate(-90 32 32)"/>
</svg>`;
}

export function NextCheckWidgetAndroid(props: NextCheckWidgetAndroidProps) {
  const c = props.colors;
  const pctLabel = props.compliancePct == null ? '–' : `${props.compliancePct}%`;
  const hasNext = props.checkpointName != null;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.url }}
      accessibilityLabel={hasNext ? `Next check ${props.checkpointName}, ${props.subtitle}` : 'All checks logged today'}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 22,
        backgroundColor: c.surface,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', justifyContent: 'space-between' }}>
        <TextWidget
          text={props.late ? 'OVERDUE' : 'NEXT CHECK'}
          style={{ fontSize: 11, fontWeight: '600', color: props.late ? c.accentText : c.textSecondary, letterSpacing: 0.08 }}
        />
        <FlexWidget style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <SvgWidget svg={ring(props.compliancePct, c)} style={{ width: 40, height: 40 }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', flexGap: 2, width: 'match_parent' }}>
        <TextWidget
          text={hasNext ? (props.checkpointName ?? '') : 'All logged'}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 18, fontWeight: 'bold', color: c.text }}
        />
        <TextWidget
          text={hasNext ? props.subtitle : 'No more checks today'}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, color: props.late ? c.accentText : c.textSecondary }}
        />
        <TextWidget text={`${pctLabel} today · ${props.logged}/${props.scheduled}`} style={{ fontSize: 12, color: c.textSecondary }} />
      </FlexWidget>
    </FlexWidget>
  );
}
