import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { showToast, ToastHost } from '@/components/toast';
import { icons } from '@/constants/icons';
import { ensureDatabaseReady, useDatabaseMigrations } from '@/data';
import { useSettings } from '@/hooks/use-settings';
import { hrefFromUrl } from '@/native/deep-links';
import { haptics } from '@/native/haptics';
import { addStatusActionListener } from '@/native/live-status';
import { startNativeServices } from '@/native/surface-sync';
import { AppThemeProvider, radius, spacing, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Deep links open with Today underneath (a `templog://log/<id>` cold launch lands on a sheet over the tabs). */
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const db = useDatabaseMigrations();
  const ready = db.success || !!db.error;

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (db.error) {
    return (
      <AppThemeProvider>
        <DatabaseErrorScreen error={db.error} />
      </AppThemeProvider>
    );
  }
  if (!db.success) return null; // the splash screen stays up
  return (
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  );
}

function App() {
  const { onboarded } = useSettings();
  const { colors, isDark } = useTheme();

  useEffect(() => startNativeServices({ onOpenUrl: (url) => router.push(hrefFromUrl(url)) }), []);

  // Snooze / Discarded pressed on a notification, the Lock Screen or the Dynamic Island: the data
  // layer has already applied it; the UI only acknowledges it when the app is in front.
  useEffect(
    () =>
      addStatusActionListener((event) => {
        if (AppState.currentState !== 'active') return;
        if (event.action === 'snooze-15') {
          haptics.acknowledged();
          showToast({ message: 'Snoozed for 15 minutes' });
        } else if (event.action === 'discarded') {
          haptics.acknowledged();
          showToast({ message: 'Cooling item marked discarded' });
        }
      }),
    [],
  );

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.text,
      background: colors.surface,
      card: colors.surface,
      text: colors.text,
      border: colors.separator,
      notification: colors.heat,
    },
  };

  const sheet = (detents: number[]) =>
    ({
      presentation: 'formSheet',
      sheetGrabberVisible: true,
      sheetAllowedDetents: detents,
      sheetCornerRadius: radius.lg,
      headerShown: false,
      contentStyle: { backgroundColor: colors.surface },
    }) as const;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="log/[checkpointId]" options={sheet([1])} />
            <Stack.Screen name="cooling-log/[itemId]" options={sheet([1])} />
            <Stack.Screen name="cooling-action/[itemId]" options={sheet([0.75, 1])} />
            <Stack.Screen name="start-cooling" options={sheet([0.75, 1])} />
            <Stack.Screen name="checkpoint-editor" options={sheet([1])} />
            <Stack.Screen name="export" options={sheet([0.75, 1])} />
            <Stack.Screen name="auth" options={sheet([1])} />
            <Stack.Screen name="join-kitchen" options={sheet([0.6, 1])} />
            <Stack.Screen name="delete-account" options={sheet([0.75, 1])} />
          </Stack.Protected>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>
        </Stack>
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function DatabaseErrorScreen({ error }: { error: Error }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}
      >
        <EmptyState
          icon={icons.database}
          title="Templog couldn't open its log"
          body="Nothing has been deleted. Try again; if it keeps failing, restart the app or contact support."
          action={<PrimaryButton title="Try again" block={false} onPress={() => ensureDatabaseReady().catch(() => undefined)} />}
        />
        <AppText variant="caption" tone="secondary" selectable align="center">
          {error.message}
        </AppText>
      </ScrollView>
    </View>
  );
}
