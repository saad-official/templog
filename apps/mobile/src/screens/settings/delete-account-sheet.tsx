import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { deleteAccountEverywhere } from '@/data';
import { haptics } from '@/native/haptics';

/**
 * Deletes the Templog account on the server (memberships, devices, owned shared kitchens). The logs
 * on this phone stay; delete them separately in Settings › Your data.
 */
export function DeleteAccountSheet() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!password) {
      setError('Enter your password to confirm.');
      haptics.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await deleteAccountEverywhere(password);
      if (message) {
        haptics.fail();
        setError(message);
        return;
      }
      haptics.acknowledged();
      router.back();
      showToast({ message: 'Account deleted' });
    } catch (e) {
      haptics.fail();
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet title="Delete account">
      <AppText variant="body" weight="600" tone="heat">
        This permanently deletes your account, your memberships and any kitchen you share (staff lose access). It cannot be undone.
      </AppText>
      <AppText variant="body" tone="secondary">
        The kitchen, checkpoints and readings on this phone are not deleted. Export them first if you need a copy, then delete them in Settings › Your data.
      </AppText>
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void remove()}
        error={error}
      />
      <PrimaryButton title="Delete my account" icon={icons.trash} variant="destructive" size="lg" loading={busy} onPress={() => void remove()} />
    </FormSheet>
  );
}
