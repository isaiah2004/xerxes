// One call at a time. A second tap on a mic button while the call screen is still opening (or a mic button on a
// screen opened from the call) pushes another call screen on top of the first. Without this it dials a second agent
// over the first one, both hearing you, and the call looks like it broke and restarted.

let holder: symbol | null = null;

/** The call screen takes the slot when it opens. False when another call screen already has it: that call carries on. */
export function claimCall(screen: symbol): boolean {
  if (holder && holder !== screen) return false;
  holder = screen;
  return true;
}

/** Given back when the call screen closes, or as soon as you hang up, so a new call can open while the old one animates away. */
export function releaseCall(screen: symbol) {
  if (holder === screen) holder = null;
}
