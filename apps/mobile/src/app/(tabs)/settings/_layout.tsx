import { Stack } from 'expo-router';

import { ErrorView } from '@/components/error-view';
import { useTabStackOptions } from '@/hooks/use-stack-options';

export const ErrorBoundary = ErrorView;

export const unstable_settings = { initialRouteName: 'index' };

export default function SettingsStack() {
  const options = useTabStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="kitchen" options={{ title: 'Kitchen', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="checkpoints" options={{ title: 'Checkpoints', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="team" options={{ title: 'Team', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
