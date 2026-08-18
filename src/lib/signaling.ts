import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

export type SignalPayload = {
  sender: string;
  kind: "join" | "offer" | "answer" | "ice" | "leave";
  data?: unknown;
};
export type SignalConnection = {
  send: (payload: SignalPayload) => Promise<void>;
  close: () => Promise<void>;
};

export async function connectSignaling(
  room: string,
  onSignal: (payload: SignalPayload) => void,
): Promise<SignalConnection> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const client = createClient(url, key);
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

  const channel = new BroadcastChannel(`sendglide:${room}`);
  channel.onmessage = (event: MessageEvent<SignalPayload>) =>
    onSignal(event.data);
  return {
    send: async (payload) => channel.postMessage(payload),
    close: async () => channel.close(),
  };
}
