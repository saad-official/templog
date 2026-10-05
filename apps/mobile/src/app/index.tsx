import { Redirect } from 'expo-router';

import { useSettings } from '@/hooks/use-settings';

/** `/`: Today once the kitchen is set up, otherwise the welcome pages. */
export default function Index() {
  const { onboarded } = useSettings();
  return <Redirect href={onboarded ? '/today' : '/welcome'} />;
}
