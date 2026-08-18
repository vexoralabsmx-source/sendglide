export type ContentKind = "url" | "email" | "phone" | "code" | "text";

export function detectContentKind(input: string): ContentKind {
  const value = input.trim();
  if (/^https?:\/\/[^\s]+$/i.test(value)) return "url";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  if (/^\+?[\d\s().-]{7,20}$/.test(value) && /\d/.test(value)) return "phone";
  if (
    /\n/.test(value) &&
    /[{};]|=>|\b(const|let|function|class|import)\b/.test(value)
  )
    return "code";
  return "text";
}

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function sanitizeFilename(name: string): string {
  return (
    name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").slice(0, 255) || "file"
  );
}
