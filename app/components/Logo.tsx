import Svg, { Rect } from "react-native-svg";

/** The logo's teal. The app's own green (`color.primary`) is a deeper shade of it. */
export const LOGO_TEAL = "#20C5A3";

// The mark in logo units: a 62.35 teal tile with a 15.59 corner radius (a quarter of its side) holding four 16.78
// squares (4.2 corner radius), each turned 45° about its own centre and set as a plus. Same artwork as the
// "Xerxes icon.svg" logo and the deck's #i-logo symbol.
const TILE = 62.35;
const SIDE = 16.78;
const CENTRES = [
  [31.12, 18.03],
  [44.32, 31.23],
  [31.23, 44.32],
  [18.03, 31.12],
] as const;

const squares = (fill: string) =>
  CENTRES.map(([cx, cy]) => (
    <Rect key={`${cx},${cy}`} x={cx - SIDE / 2} y={cy - SIDE / 2} width={SIDE} height={SIDE} rx={4.2} fill={fill} transform={`rotate(45 ${cx} ${cy})`} />
  ));

/** The Xerxes glyph on its own, for places that stand for Xerxes itself (not for the microphone). The glyph fills
 *  about 92% of its `size` box, a little more than a Lucide icon does. */
export function LogoGlyph({ size = 24, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="6 6 50.35 50.35">
      {squares(color)}
    </Svg>
  );
}

/** The whole logo: the glyph on its rounded teal tile. */
export function LogoMark({ size = 40, color = LOGO_TEAL, glyph = "#fff" }: { size?: number; color?: string; glyph?: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${TILE} ${TILE}`}>
      <Rect width={TILE} height={TILE} rx={TILE / 4} fill={color} />
      {squares(glyph)}
    </Svg>
  );
}
