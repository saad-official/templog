import { Stack } from 'expo-router';

import { ErrorView } from '@/components/error-view';
import { useTabStackOptions } from '@/hooks/use-stack-options';

export const ErrorBoundary = ErrorView;

export const unstable_settings = { initialRouteName: 'index' };

export default function HistoryStack() {
  const options = useTabStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'History' }} />
      <Stack.Screen name="checkpoint/[id]" options={{ title: 'Checkpoint', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
