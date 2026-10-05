// Semantic haptics (expo-haptics). Fire-and-forget; silently no-op where unsupported.
import * as Haptics from 'expo-haptics';

const run = (p: Promise<void>) => {
  p.catch(() => undefined);
};

export const haptics = {
  /** A reading in range, a cooling stage passed. */
  pass: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A reading out of range or a missed cooling stage: the user must notice. */
  fail: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Snooze / discard: acknowledged, not celebrated. */
  acknowledged: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Picker / segmented / tab changes. */
  selection: () => run(Haptics.selectionAsync()),
  /** Keypad press (subtle). */
  key: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** A validation or network problem. */
  warning: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
