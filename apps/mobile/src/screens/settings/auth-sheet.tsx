import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { links } from '@/constants/links';
import { signInAndSync, signUpAndSync } from '@/data';
import { haptics } from '@/native/haptics';
import { spacing, touchTarget } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign in or create a Templog account (only needed for a shared kitchen). */
export function AuthSheet() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'sign-up' ? 'sign-up' : 'sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const signUp = mode === 'sign-up';

  const problem = !EMAIL.test(email.trim())
    ? 'Enter your email address.'
    : password.length < 8
      ? 'Passwords have at least 8 characters.'
      : signUp && !name.trim()
        ? 'Tell your team who you are.'
        : null;

  const submit = async () => {
    if (problem) {
      setError(problem);
      haptics.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = signUp
        ? await signUpAndSync({ name: name.trim(), email: email.trim(), password })
        : await signInAndSync({ email: email.trim(), password });
      if (message) {
        haptics.fail();
        setError(message);
        return;
      }
      haptics.pass();
      router.back();
      showToast({ message: signUp ? 'Account created' : 'Signed in' });
    } catch (e) {
      haptics.fail();
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet title={signUp ? 'Create account' : 'Sign in'} primaryLabel={signUp ? 'Create' : 'Sign in'} onPrimary={() => void submit()} busy={busy}>
      <AppText variant="body" tone="secondary">
        {signUp
          ? 'An account lets you share this kitchen with your team. Your logs stay on this phone until you share or join a kitchen.'
          : 'Welcome back. Signing in restores your shared kitchen; the logs on this phone are not changed.'}
      </AppText>
      {signUp ? (
        <TextField
          label="Your name"
          placeholder="How your team sees you"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          maxLength={80}
        />
      ) : null}
      <TextField
        ref={emailRef}
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType={signUp ? 'username' : 'emailAddress'}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        placeholder={signUp ? 'At least 8 characters' : 'Your password'}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={signUp ? 'new-password' : 'current-password'}
        textContentType={signUp ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        error={error}
      />
      <PrimaryButton title={signUp ? 'Create account' : 'Sign in'} size="lg" loading={busy} onPress={() => void submit()} />
      <View style={{ alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            setMode(signUp ? 'sign-in' : 'sign-up');
          }}
          style={({ pressed }) => ({ minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.md, opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="callout" weight="600">
            {signUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </AppText>
        </Pressable>
      </View>
      {signUp ? (
        <AppText variant="caption" tone="secondary" align="center">
          {`By creating an account you agree to the terms at ${links.terms.replace('https://', '')}.`}
        </AppText>
      ) : null}
    </FormSheet>
  );
}
