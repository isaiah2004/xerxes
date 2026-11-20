import * as Haptics from "expo-haptics";

// One place for tactile feedback. expo-haptics covers iOS/Android natively and the web
// (Vibration API on Android browsers, the switch-toggle trick on iOS Safari); it's a no-op elsewhere.
const fire = (fn: () => Promise<void>) => () => {
  try {
    fn().catch(() => undefined);
  } catch {
    /* unsupported platform */
  }
};

export const haptic = {
  /** light tick — tabs, chips, selecting a day */
  tap: fire(() => Haptics.selectionAsync()),
  /** button press */
  press: fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** heavier press — orb, call controls */
  heavy: fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** the agent finished and has a pick / call connected */
  success: fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
export type HapticKind = keyof typeof haptic;
