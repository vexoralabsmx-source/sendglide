import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

let sharedClient: SupabaseClient | null = null;

function getSupabaseClient(url: string, key: string): SupabaseClient {
  sharedClient ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return sharedClient;
}

export type SignalPayload = {
  sender: string;
  kind: "join" | "offer" | "answer" | "ice" | "leave";
  data?: unknown;
};
export type SignalConnection = {
  send: (payload: SignalPayload) => Promise<void>;
  close: () => Promise<void>;
};

export function isValidSignalingConfig(
  url: string | undefined,
  key: string | undefined,
): boolean {
  if (!url || !key || key.length < 20) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function connectSignaling(
  room: string,
  onSignal: (payload: SignalPayload) => void,
): Promise<SignalConnection> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isValidSignalingConfig(url, key)) {
    const client = getSupabaseClient(url!, key!);
    const channel: RealtimeChannel = client.channel(`sendglide:${room}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) =>
      onSignal(payload as SignalPayload),
    );
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reject(new Error(`Signaling ${status.toLowerCase()}`));
      });
    });
    return {
      send: async (payload) => {
        await channel.send({ type: "broadcast", event: "signal", payload });
      },
      close: async () => {
        await client.removeChannel(channel);
      },
    };
  }

  if (process.env.NODE_ENV === "production")
    throw new Error("Production signaling is not configured correctly");

  const channel = new BroadcastChannel(`sendglide:${room}`);
  channel.onmessage = (event: MessageEvent<SignalPayload>) =>
    onSignal(event.data);
  return {
    send: async (payload) => channel.postMessage(payload),
    close: async () => channel.close(),
  };
}
