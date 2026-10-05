import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ChoiceChips, Field } from '@/components/form-fields';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { icons, type IconName } from '@/constants/icons';
import { updateSettings } from '@/data';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { requestNotificationPermission } from '@/native/notifications';
import { radius, spacing, useTheme } from '@/theme';

const LEADS = [0, 5, 10, 15, 30] as const;

function Point({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={colors.text} />
      </View>
      <AppText variant="body" tone="secondary" style={{ flex: 1, paddingTop: spacing.xxs }}>
        {text}
      </AppText>
    </View>
  );
}

/**
 * Explains reminders before the one-shot OS prompt, then finishes onboarding. "Not now" still
 * finishes: reminders can be turned on later in Settings.
 */
export function RemindersPrimingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [lead, setLead] = useState<number>(settings.reminderLeadMinutes);
  const [busy, setBusy] = useState(false);

  const finish = async (ask: boolean) => {
    setBusy(true);
    try {
      if (ask) await requestNotificationPermission().catch(() => null);
      haptics.pass();
      // The onboarding guard flips and the router lands on Today.
      await updateSettings({ reminderLeadMinutes: lead, onboarded: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.lg,
          paddingHorizontal: spacing.lg,
          gap: spacing.xl,
        }}
      >
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 88, height: 88, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icons.bell} size={44} color={colors.text} />
          </View>
          <AppText variant="title" align="center" accessibilityRole="header">
            Never miss a check
          </AppText>
          <AppText variant="body" tone="secondary" align="center">
            Templog reminds the line when a check is due, escalates when it is overdue, and counts cooling stages down on the Lock Screen.
          </AppText>
        </View>

        <View style={{ gap: spacing.md }}>
          <Point icon={icons.due} text="Log now and Snooze 15 work right from the notification." />
          <Point icon={icons.cooling} text="Cooling prompts arrive before each stage deadline, and again if a stage is missed." />
          <Point icon={icons.clock} text="Only during opening hours. Nothing at night." />
        </View>

        <Field label="Remind me before a check is due">
          <ChoiceChips
            accessibilityLabel="Reminder lead time"
            options={LEADS.map((m) => ({ value: m, label: m === 0 ? 'On time' : `${m} min` }))}
            isSelected={(m) => m === lead}
            onToggle={setLead}
          />
        </Field>

        <View style={{ flex: 1 }} />

        <View style={{ gap: spacing.xs }}>
          <PrimaryButton title="Turn on reminders" size="lg" icon={icons.bell} loading={busy} onPress={() => void finish(true)} />
          <PrimaryButton title="Not now" variant="ghost" disabled={busy} onPress={() => void finish(false)} />
        </View>
      </ScrollView>
    </View>
  );
}
