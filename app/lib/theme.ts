// Xerxes design system — light theme, one palette.
//
//   Navy      #101828  dark surfaces (light text on it) + primary text
//   Off-white #FDF9FF  app background (dark text on it)
//   Green     #119C70  primary accent: buttons, switches, progress, success
//   Orange    #E08B4F  warning / high priority
//   Red       #C24C4C  danger / urgent
//   Blue      #9BBAF3  info (navy text on it — it's a light tone)
//
// Every gradient stays inside ONE hue (lightness shift only) so surfaces feel rich but never off-palette.

export const palette = {
  navy: "#101828",
  offWhite: "#FDF9FF",
  green: "#119C70",
  orange: "#E08B4F",
  red: "#C24C4C",
  blue: "#9BBAF3",
} as const;

export const color = {
  // surfaces
  paper: palette.offWhite,
  card: "#FFFFFF",
  navy: palette.navy,
  // text (navy scale)
  ink: palette.navy,
  ink2: "#344054",
  muted: "#667085",
  faint: "#98A2B3",
  // lines & fills
  line: "#ECE8F2",
  track: "#F1EEF5",
  chip: "#F3F0F7",
  // semantic
  primary: palette.green,
  ok: "#0B7A57",
  okBg: "#E3F5EE",
  warning: palette.orange,
  warn: "#B5652F",
  warnBg: "#FCEFE5",
  danger: palette.red,
  bad: "#A63C3C",
  badBg: "#F9E7E7",
  info: palette.blue,
  infoInk: "#3A5FAE",
  infoBg: "#EDF2FD",
} as const;

export const gradient = {
  primary: ["#1FB886", "#119C70", "#0C8360"] as const,
  navy: ["#2A3754", "#101828", "#0A101C"] as const,
  info: ["#BCD0F8", "#9BBAF3", "#87A9EE"] as const,
  warning: ["#EEA36F", "#E08B4F", "#CE773F"] as const,
  danger: ["#D46363", "#C24C4C", "#AD3F3F"] as const,
} as const;
export type GradientName = keyof typeof gradient;

/** Foreground for content placed on a gradient (blue is light → navy text). */
export const onGradient: Record<GradientName, string> = {
  primary: "#FFFFFF",
  navy: "#FFFFFF",
  info: palette.navy,
  warning: "#FFFFFF",
  danger: "#FFFFFF",
};

/** Duolingo-style "ledge" under pressable surfaces (a darker step of the same hue). */
export const ledge: Record<GradientName | "ink" | "white" | "ghost", string> = {
  primary: "#08684B",
  navy: "#03070F",
  info: "#6F92DA",
  warning: "#B5652F",
  danger: "#8F3434",
  ink: "#03070F",
  white: "rgba(16,24,40,0.22)",
  ghost: "#E2DDE9",
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, xxl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const font = {
  display: "InterTight_800ExtraBold",
  bold: "InterTight_700Bold",
  semi: "InterTight_600SemiBold",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  strong: "Inter_600SemiBold",
} as const;

export const shadow = {
  card: { shadowColor: palette.navy, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  float: { shadowColor: palette.navy, shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
} as const;
