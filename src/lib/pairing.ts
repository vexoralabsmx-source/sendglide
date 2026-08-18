const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomId(bytes = 16): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function generatePairingCode(length = 6): string {
  const values = crypto.getRandomValues(new Uint8Array(length));
  const code = Array.from(
    values,
    (value) => ALPHABET[value % ALPHABET.length],
  ).join("");
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function normalizePairingCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now >= expiresAt;
}
