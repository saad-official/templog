import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { JoinCodeCard } from '@/components/join-code-card';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SkeletonList } from '@/components/skeleton';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { createSharedKitchen, formatClock, leaveKitchen, removeKitchenMember, signOutAndForget, stopSharingKitchen, syncNow, type KitchenMemberView } from '@/data';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSharedKitchens } from '@/hooks/use-kitchen-members';
import { useSession } from '@/hooks/use-session';
import { useSettings } from '@/hooks/use-settings';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

import { teamErrorMessage } from './team-errors';

function Avatar({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="callout" weight="700" maxFontSizeMultiplier={1.3}>
        {text}
      </AppText>
    </View>
  );
}

function initialsOf(m: KitchenMemberView): string {
  if (m.initials) return m.initials;
  return m.displayName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function confirm(title: string, body: string, action: string, run: () => Promise<unknown>, done: string) {
  haptics.warning();
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: action,
      style: 'destructive',
      onPress: () =>
        run()
          .then(() => showToast({ message: done }))
          .catch((e) => showToast({ message: teamErrorMessage(e) })),
    },
  ]);
}

/**
 * Team: optional account → share this kitchen (join code for staff) or join one with a code;
 * members, sync status, leave / stop sharing, sign out and delete account.
 */
export function TeamScreen() {
  const { data: session, isPending } = useSession();
  const kitchen = useKitchen();
  const settings = useSettings();
  const shared = useSharedKitchens();
  const sync = useSyncStatus();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const active = shared.active;
  const me = session?.user;

  if (isPending && !session) {
    return (
      <Screen>
        <SkeletonList rows={3} />
      </Screen>
    );
  }

  if (!me) {
    return (
      <Screen>
        <EmptyState
          icon={icons.team}
          title="Log together"
          body="Create a free account to share this kitchen. Staff join with a code, readings sync across phones, and the owner sees who logged what."
          action={
            <View style={{ alignSelf: 'stretch', gap: spacing.xs }}>
              <PrimaryButton title="Create account" size="lg" onPress={() => router.push({ pathname: '/auth', params: { mode: 'sign-up' } })} />
              <PrimaryButton title="Sign in" variant="secondary" onPress={() => router.push({ pathname: '/auth', params: { mode: 'sign-in' } })} />
            </View>
          }
        />
        <ListGroup footer="Without an account nothing leaves this phone. Accounts are only for a shared kitchen.">
          <ListRow title="What syncs" subtitle="Checkpoints, readings with initials, and cooling timers of the shared kitchen." icon={icons.sync} />
          <ListRow title="Weekly summary" subtitle="The owner gets a Monday summary of last week's checks." icon={icons.calendar} />
        </ListGroup>
      </Screen>
    );
  }

  const share = async () => {
    setBusy(true);
    try {
      await createSharedKitchen({ displayName: me.name || undefined, initials: settings.initialsDefault });
      haptics.pass();
      showToast({ message: 'Kitchen shared. Give your staff the join code.' });
    } catch (e) {
      haptics.warning();
      showToast({ message: teamErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const others = active?.members.filter((m) => m.userId !== me.id) ?? [];
  const syncLine = sync.running
    ? 'Syncing…'
    : sync.error
      ? `Last sync failed: ${sync.error}`
      : sync.lastSyncAt
        ? `Synced at ${formatClock(sync.lastSyncAt, kitchen?.tz)}`
        : 'Not synced yet';

  return (
    <Screen refreshControl={<RefreshControl refreshing={shared.loading} onRefresh={() => void shared.refresh().catch(() => undefined)} />}>
      {active ? (
        <>
          {active.isOwner && active.inviteCode ? <JoinCodeCard code={active.inviteCode} kitchenName={active.name} /> : null}
          {!active.isOwner ? (
            <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.md }}>
              <AppText variant="body">{`You log for ${active.name}, owned by ${active.ownerName}.`}</AppText>
            </View>
          ) : null}
          <View style={{ gap: spacing.xs }}>
            <SectionHeader title={`Members · ${active.members.length}`} />
            <ListGroup inset={spacing.md + 36 + spacing.sm}>
              {active.members.map((m) => {
                const mine = m.userId === me.id;
                return (
                  <ListRow
                    key={m.userId}
                    title={mine ? `${m.displayName} (you)` : m.displayName}
                    subtitle={m.role === 'owner' ? 'Owner' : 'Staff'}
                    leading={<Avatar text={initialsOf(m)} />}
                    onPress={
                      active.isOwner && !mine
                        ? () =>
                            confirm(`Remove ${m.displayName}?`, 'They stop seeing this kitchen. Readings they logged stay on the record.', 'Remove', () => removeKitchenMember(active.id, m.userId), `${m.displayName} removed`)
                        : undefined
                    }
                    chevron={false}
                    accessibilityHint={active.isOwner && !mine ? 'Removes this member' : undefined}
                  />
                );
              })}
            </ListGroup>
            {active.isOwner && others.length === 0 ? (
              <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
                No staff yet. Share the code above.
              </AppText>
            ) : null}
          </View>
          <View style={{ gap: spacing.xs }}>
            <SectionHeader title="Sync" />
            <ListGroup>
              <ListRow title="Sync now" subtitle={syncLine} icon={icons.sync} onPress={() => void syncNow()} disabled={sync.running} chevron={false} />
              {active.isOwner ? (
                <ListRow
                  title="Stop sharing"
                  icon={icons.trash}
                  tone="heat"
                  chevron={false}
                  onPress={() =>
                    confirm('Stop sharing this kitchen?', 'Staff lose access and the server copy is deleted. Everything stays on this phone.', 'Stop sharing', () => stopSharingKitchen(active.id), 'Sharing stopped')
                  }
                />
              ) : (
                <ListRow
                  title="Leave kitchen"
                  icon={icons.logout}
                  tone="heat"
                  chevron={false}
                  onPress={() => confirm(`Leave ${active.name}?`, 'This phone goes back to your own kitchen. Readings you logged stay with the team.', 'Leave', () => leaveKitchen(active.id, me.id), `Left ${active.name}`)}
                />
              )}
            </ListGroup>
          </View>
        </>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <EmptyState
            icon={icons.team}
            title="Share this kitchen"
            body={`Share ${kitchen?.name ?? 'your kitchen'} and staff can join with a code, or join a kitchen someone else shared.`}
          />
          <PrimaryButton title="Share this kitchen" icon={icons.team} size="lg" loading={busy} onPress={() => void share()} />
          <PrimaryButton title="Join with a code" icon={icons.key} variant="secondary" onPress={() => router.push('/join-kitchen')} />
          {shared.error ? (
            <AppText variant="caption" tone="heat" align="center" selectable>
              {shared.error}
            </AppText>
          ) : null}
        </View>
      )}

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Account" />
        <ListGroup>
          <ListRow title={me.name || 'Signed in'} subtitle={me.email} icon={icons.account} />
          <ListRow
            title="Sign out"
            icon={icons.logout}
            chevron={false}
            onPress={() => confirm('Sign out?', 'Your kitchen and logs stay on this phone. Syncing stops until you sign in again.', 'Sign out', () => signOutAndForget(), 'Signed out')}
          />
          <ListRow title="Delete account" icon={icons.trash} tone="heat" onPress={() => router.push('/delete-account')} />
        </ListGroup>
      </View>
    </Screen>
  );
}
