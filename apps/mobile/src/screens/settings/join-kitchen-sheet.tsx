import { JoinCodeSchema } from '@templog/shared/schemas';
import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { cleanInitials } from '@/components/initials-chip';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { joinKitchen } from '@/data';
import { useSession } from '@/hooks/use-session';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { textStyles } from '@/theme';

import { teamErrorMessage } from './team-errors';

/** Join a shared kitchen with the code its owner shared. */
export function JoinKitchenSheet() {
  const { data: session } = useSession();
  const settings = useSettings();
  const [code, setCode] = useState('');
  const [name, setName] = useState(session?.user.name ?? '');
  const [initials, setInitials] = useState(settings.initialsDefault ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = JoinCodeSchema.safeParse(code).success;

  const join = async () => {
    if (!session) {
      router.replace({ pathname: '/auth', params: { mode: 'sign-in' } });
      return;
    }
    if (!valid) {
      haptics.warning();
      setError('Codes are 6 to 8 letters and numbers.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const kitchen = await joinKitchen(code, { displayName: name.trim() || undefined, initials: initials || undefined });
      haptics.pass();
      router.back();
      showToast({ message: `Joined ${kitchen.name}. Its checkpoints arrive in a moment.` });
    } catch (e) {
      haptics.fail();
      setError(teamErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet title="Join a kitchen" primaryLabel="Join" onPrimary={() => void join()} busy={busy}>
      <AppText variant="body" tone="secondary">
        Enter the code from the kitchen owner (Settings › Team on their phone). This phone then logs for that kitchen.
      </AppText>
      <TextField
        label="Join code"
        placeholder="K7Q2MX"
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8));
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={8}
        returnKeyType="go"
        onSubmitEditing={() => void join()}
        error={error}
        style={[textStyles.title, { letterSpacing: 4 }]}
      />
      <TextField label="Your name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={80} hint="Shown to the owner next to your readings." />
      <TextField label="Your initials" value={initials} onChangeText={(t) => setInitials(cleanInitials(t))} autoCapitalize="characters" autoCorrect={false} maxLength={4} />
      <PrimaryButton title="Join kitchen" icon={icons.key} size="lg" loading={busy} disabled={!valid} onPress={() => void join()} />
    </FormSheet>
  );
}
