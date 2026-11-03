export type EncoderReading = { x: number; y: number; receivedAt: number };
// Firmware transmits signed 32-bit counts as fixed-width hexadecimal words.
export function parseEncoderLine(line: string): EncoderReading | null {
  const match = /^ENC ([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{8})$/.exec(line);
  if (!match) return null;
  return { x: parseInt(match[1],16) | 0, y: parseInt(match[2],16) | 0, receivedAt: 0 };
}
export function encoderDisplacement(count: number, zero: number, inverted = false): number {
  // Modular subtraction tolerates a signed-counter rollover within a session.
  return ((count - zero) | 0) / 500 * (inverted ? -1 : 1);
}
