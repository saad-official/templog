import type { Appearance } from '@templog/shared/schemas';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChoiceChips } from '@/components/form-fields';
import { ListGroup, ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { showToast } from '@/components/toast';
import { ToggleRow } from '@/components/toggle-row';
import { plural } from '@/constants/format';
import { icons } from '@/constants/icons';
import { FOOD_SAFETY_DISCLAIMER, links } from '@/constants/links';
import { deleteAllLocalData, exportAll, seedDemoData, updateSettings } from '@/data';
import { useCheckpoints } from '@/hooks/use-checkpoints';
import { useSharedKitchens } from '@/hooks/use-kitchen-members';
import { useKitchen } from '@/hooks/use-kitchen';
import { useNotificationPermission } from '@/hooks/use-notification-permission';
import { useSession } from '@/hooks/use-session';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { openNotificationSettings, requestNotificationPermission } from '@/native/notifications';
import { spacing, touchTarget } from '@/theme';

const APPEARANCE = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

const LEADS = [0, 5, 10, 15, 30] as const;

function open(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/** Settings: kitchen, checkpoints, team, reminders, appearance, data and about. */
export function SettingsScreen() {
  const kitchen = useKitchen();
  const checkpoints = useCheckpoints();
  const settings = useSettings();
  const permission = useNotificationPermission();
  const { data: session } = useSession();
  const { active } = useSharedKitchens();
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  const granted = permission?.status === 'granted';
  const fixReminders = async () => {
    const result = await requestNotificationPermission().catch(() => null);
    if (result && result.status !== 'granted' && !result.canAskAgain) openNotificationSettings().catch(() => undefined);
  };

  const save = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch).catch((e: unknown) => showToast({ message: e instanceof Error ? e.message : "Couldn't save." }));
  };

  const doExport = async (format: 'csv' | 'json') => {
    setExporting(format);
    try {
      const r = await exportAll(format);
      if (!r.ok) showToast({ message: r.reason === 'unavailable' ? "Sharing isn't available on this device." : r.reason === 'empty' ? 'Nothing to export yet.' : "Couldn't export. Please try again." });
    } finally {
      setExporting(null);
    }
  };

  const confirmWipe = () => {
    haptics.warning();
    Alert.alert(
      'Delete all data on this phone?',
      'Every checkpoint, reading and cooling record on this phone is erased, reminders stop and setup starts over. This cannot be undone. Export first if you need the records. A shared kitchen keeps its copy on the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () =>
            deleteAllLocalData()
              .then(() => showToast({ message: 'All local data deleted' }))
              .catch(() => showToast({ message: "Couldn't delete. Please try again." })),
        },
      ],
    );
  };

  const version = Constants.expoConfig?.version ?? '';
  const team = active ? `${active.isOwner ? 'Owner' : 'Staff'} · ${plural(active.members.length, 'member')}` : session ? 'Not shared' : 'Solo, no account';

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Kitchen" />
        <ListGroup>
          <ListRow title="Kitchen" subtitle={kitchen ? `${kitchen.name} · °${kitchen.unit} · ${kitchen.tz.replace(/_/g, ' ')}` : undefined} icon={icons.kitchen} onPress={() => router.push('/settings/kitchen')} />
          <ListRow title="Checkpoints" value={String(checkpoints.length)} icon={icons.checkpoints} onPress={() => router.push('/settings/checkpoints')} />
          <ListRow title="Team" subtitle={team} icon={icons.team} onPress={() => router.push('/settings/team')} />
        </ListGroup>
      </View>

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Reminders" />
        <ListGroup footer="Reminders are time-sensitive so they reach the line. Overdue checks raise a second alert and the app badge.">
          <ListRow
            title="Notifications"
            icon={granted ? icons.bell : icons.bellOff}
            value={permission === null ? undefined : granted ? 'On' : 'Off'}
            onPress={granted ? () => openNotificationSettings().catch(() => undefined) : () => void fixReminders()}
            accessibilityLabel={`Notifications, ${granted ? 'on' : 'off'}`}
            accessibilityHint={granted ? 'Opens system settings' : 'Turns on reminders'}
          />
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs, minHeight: touchTarget }}>
            <AppText variant="body">Remind before a check is due</AppText>
            <ChoiceChips
              accessibilityLabel="Reminder lead time"
              options={LEADS.map((m) => ({ value: m, label: m === 0 ? 'On time' : `${m} min` }))}
              isSelected={(m) => m === settings.reminderLeadMinutes}
              onToggle={(reminderLeadMinutes) => save({ reminderLeadMinutes })}
            />
          </View>
          <ToggleRow
            title="Quiet outside opening hours"
            subtitle="No check reminders while the kitchen is closed"
            icon={icons.moon}
            value={settings.quietOutsideHours}
            onValueChange={(quietOutsideHours) => save({ quietOutsideHours })}
          />
        </ListGroup>
      </View>

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Appearance" />
        <SegmentedControl accessibilityLabel="Appearance" options={APPEARANCE} value={settings.appearance} onChange={(appearance: Appearance) => save({ appearance })} />
      </View>

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Your data" />
        <ListGroup footer="Readings are kitchen records: initials only, no personal data. A solo kitchen never leaves this phone.">
          <ListRow title={exporting === 'csv' ? 'Preparing…' : 'Export everything (CSV)'} icon={icons.csv} onPress={() => void doExport('csv')} disabled={!!exporting} chevron={false} />
          <ListRow title={exporting === 'json' ? 'Preparing…' : 'Export everything (JSON)'} icon={icons.json} onPress={() => void doExport('json')} disabled={!!exporting} chevron={false} />
          <ListRow title="Inspector report (PDF)" icon={icons.pdf} onPress={() => router.push('/export')} />
          <ListRow title="Delete all data on this phone" icon={icons.trash} tone="heat" onPress={confirmWipe} chevron={false} />
        </ListGroup>
      </View>

      {__DEV__ ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Developer" />
          <ListGroup>
            <ListRow
              title="Load demo kitchen"
              subtitle="Corner Café: 5 checkpoints, 6 days, 2 cooling timers"
              icon={icons.sparkles}
              chevron={false}
              onPress={() =>
                seedDemoData()
                  .then(() => showToast({ message: 'Demo data loaded' }))
                  .catch((e: unknown) => showToast({ message: e instanceof Error ? e.message : 'Seed failed' }))
              }
            />
          </ListGroup>
        </View>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="About" />
        <ListGroup footer={FOOD_SAFETY_DISCLAIMER}>
          <ListRow title="Version" value={version} icon={icons.info} />
          <ListRow title="FDA Food Code limits" icon={icons.book} onPress={() => open(links.foodCode)} accessibilityRole="link" />
          <ListRow title="Privacy" icon={icons.shield} onPress={() => open(links.privacy)} accessibilityRole="link" />
          <ListRow title="Support" icon={icons.lifebuoy} onPress={() => open(links.support)} accessibilityRole="link" />
          <ListRow title="Terms" icon={icons.doc} onPress={() => open(links.terms)} accessibilityRole="link" />
        </ListGroup>
        <AppText variant="caption" tone="tertiary" align="center">
          Templog is free. No ads, no subscriptions.
        </AppText>
      </View>
    </Screen>
  );
}
