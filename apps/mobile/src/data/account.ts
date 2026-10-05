// Account flows that span auth, shared kitchens, push registration and sync bookkeeping. Kitchen
// records on the device are never touched here (that is `deleteAllLocalData` in actions.ts).
import { deleteAccount, signIn, signOut, signUp } from './auth-client';
import { registerPushDevice, unregisterPushDevice } from './devices';
import { clearKitchens, refreshKitchens } from './kitchens-client';
import { setAppValue } from './settings-repo';
import { resetSyncCursors } from './sync-state-repo';
import { syncNow } from './sync-client';

type AuthResult = { error?: { message?: string; status?: number } | null };

function failed(res: AuthResult): string | null {
  return res.error ? (res.error.message ?? 'Request failed') : null;
}

/** After a successful sign-in / sign-up: load shared kitchens, register the push token, sync if shared. */
export async function afterSignIn(): Promise<void> {
  await refreshKitchens().catch(() => undefined);
  await registerPushDevice({ prompt: false }).catch(() => undefined);
  await syncNow();
}

/** Email + password sign-in, then `afterSignIn`. Returns an error message or null. */
export async function signInAndSync(input: { email: string; password: string }): Promise<string | null> {
  const error = failed((await signIn(input)) as AuthResult);
  if (!error) await afterSignIn();
  return error;
}

/** Account creation, then `afterSignIn`. Returns an error message or null. */
export async function signUpAndSync(input: { name: string; email: string; password: string }): Promise<string | null> {
  const error = failed((await signUp(input)) as AuthResult);
  if (!error) await afterSignIn();
  return error;
}

/**
 * Signs out: removes this device's push token, forgets cached kitchens and sync cursors (the next
 * sign-in pushes everything again). Kitchen records stay on the phone.
 */
export async function signOutAndForget(): Promise<void> {
  await unregisterPushDevice();
  await signOut().catch(() => undefined);
  clearKitchens();
  resetSyncCursors();
  setAppValue('lastSyncAt', undefined);
  setAppValue('lastSyncError', undefined);
}

/** Deletes the account on the server (memberships, devices, owned shared kitchens), then signs out locally. */
export async function deleteAccountEverywhere(password: string): Promise<string | null> {
  const error = failed((await deleteAccount(password)) as AuthResult);
  if (error) return error;
  await signOutAndForget();
  return null;
}
