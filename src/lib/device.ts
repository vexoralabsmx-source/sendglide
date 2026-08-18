import { randomId } from "@/lib/pairing";

export type DeviceInfo = {
  id: string;
  name: string;
  browser: string;
  platform: string;
};

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const platform = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  const stored = sessionStorage.getItem("sendglide-device-id") || randomId(10);
  sessionStorage.setItem("sendglide-device-id", stored);
  return { id: stored, name: `${browser} on ${platform}`, browser, platform };
}
