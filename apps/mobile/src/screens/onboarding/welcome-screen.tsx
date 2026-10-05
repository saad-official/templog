import type { Unit } from '@templog/shared/units';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { useDisplayUnit } from '@/hooks/use-kitchen';
import { haptics } from '@/native/haptics';
import { radius, spacing, touchTarget, useTheme } from '@/theme';

import { CoolingActivityArt, LogSheetArt, TwoTapsArt } from './illustrations';

type Page = { title: string; body: string; art: (unit: Unit) => ReactNode };

const PAGES: Page[] = [
  {
    title: 'Logs the inspector trusts',
    body: 'Every reading is time-stamped with initials, every missed check is shown, and every fail carries what you did about it. The PDF is one tap away.',
    art: (unit) => <LogSheetArt unit={unit} />,
  },
  {
    title: 'Cool-downs on your Lock Screen',
    body: 'Start a timer when food comes off heat. Templog counts both Food Code stages and keeps the time left on your Lock Screen, with Log reading one tap away.',
    art: (unit) => <CoolingActivityArt unit={unit} />,
  },
  {
    title: 'Two taps per reading',
    body: 'Tap the checkpoint, type the number, tap Save. Pass or fail is decided against Food Code limits you can adjust.',
    art: (unit) => <TwoTapsArt unit={unit} />,
  },
];

function PageView({ page, index, width, scrollX, parallax, unit }: { page: Page; index: number; width: number; scrollX: SharedValue<number>; parallax: boolean; unit: Unit }) {
  // Artwork drifts at 30% of the scroll speed; copy fades with distance from centre.
  const artStyle = useAnimatedStyle(() => {
    const offset = scrollX.get() - index * width;
    return {
      transform: [{ translateX: parallax ? offset * 0.3 : 0 }],
      opacity: interpolate(Math.abs(offset), [0, width * 0.8], [1, 0.2], Extrapolation.CLAMP),
    };
  });
  const copyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(scrollX.get() - index * width), [0, width * 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <View style={{ width, flex: 1, paddingHorizontal: spacing.lg, gap: spacing.xl, justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', minHeight: 220, justifyContent: 'center' }, artStyle]}>{page.art(unit)}</Animated.View>
      <Animated.View style={[{ gap: spacing.xs }, copyStyle]}>
        <AppText variant="title" align="center" accessibilityRole="header">
          {page.title}
        </AppText>
        <AppText variant="body" tone="secondary" align="center">
          {page.body}
        </AppText>
      </Animated.View>
    </View>
  );
}

function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.get() / Math.max(1, width) - index);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.3], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1.25, 0.85], Extrapolation.CLAMP) }],
    };
  });
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }, style]} />;
}

/** Three short pages (parallax art, page dots, a haptic tick per page), then kitchen setup. */
export function WelcomeScreen() {
  const { colors } = useTheme();
  const unit = useDisplayUnit();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [page, setPage] = useState(0);
  const lastPage = useRef(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });

  const onPageChange = (next: number) => {
    if (next === lastPage.current) return;
    lastPage.current = next;
    haptics.selection();
    setPage(next);
  };

  // Fires when the rounded page index changes, never per frame.
  useAnimatedReaction(
    () => Math.round(scrollX.get() / Math.max(1, width)),
    (next, prev) => {
      if (prev !== null && next !== prev) scheduleOnRN(onPageChange, next);
    },
  );

  const isLast = page === PAGES.length - 1;
  const next = () => {
    if (isLast) {
      router.push('/kitchen-setup');
      return;
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: !reduced });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          onPress={() => router.push('/kitchen-setup')}
          hitSlop={spacing.xs}
          style={({ pressed }) => ({ minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs, opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="body" weight="600">
            Skip
          </AppText>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1, direction: 'ltr' }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {PAGES.map((p, i) => (
          <PageView key={p.title} page={p} index={i} width={width} scrollX={scrollX} parallax={!reduced} unit={unit} />
        ))}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View
          accessible
          accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.pill }}
        >
          {PAGES.map((p, i) => (
            <Dot key={p.title} index={i} width={width} scrollX={scrollX} />
          ))}
        </View>
        <PrimaryButton title={isLast ? 'Set up my kitchen' : 'Continue'} size="lg" onPress={next} />
      </View>
    </View>
  );
}
