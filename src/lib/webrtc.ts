import type { SignalConnection, SignalPayload } from "@/lib/signaling";

const MAX_BUFFER = 512 * 1024;

export class WebRTCTransport {
  private peer: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private signal: SignalConnection;
  private sender: string;
  private iceServers: RTCIceServer[];
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private offerStarted = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (data: string | ArrayBuffer) => void;

  constructor(
    signal: SignalConnection,
    sender: string,
    iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }],
  ) {
    this.signal = signal;
    this.sender = sender;
    this.iceServers = iceServers;
    this.peer = this.createPeer();
  }

  private createPeer(): RTCPeerConnection {
    const peer = new RTCPeerConnection({ iceServers: this.iceServers });
    peer.onicecandidate = ({ candidate }) =>
      candidate && void this.emit("ice", candidate.toJSON());
    peer.ondatachannel = ({ channel }) => this.bindChannel(channel);
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
      } else if (state === "disconnected") {
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.disconnectTimer = setTimeout(() => {
          if (peer.connectionState === "disconnected") this.onClose?.();
        }, 8_000);
      } else if (state === "failed" || state === "closed") {
        this.onClose?.();
      }
    };
    return peer;
  }

  async startOffer(): Promise<void> {
    if (this.offerStarted) {
      if (
        this.peer.connectionState === "disconnected" ||
        this.peer.connectionState === "failed" ||
        this.peer.connectionState === "closed"
      )
        this.resetPeer();
      else return;
    }
    this.offerStarted = true;
    this.bindChannel(this.peer.createDataChannel("send-1", { ordered: true }));
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    await this.emit("offer", offer);
  }

  async handleSignal(payload: SignalPayload): Promise<void> {
    if (payload.sender === this.sender) return;
    if (payload.kind === "offer") {
      await this.peer.setRemoteDescription(
        payload.data as RTCSessionDescriptionInit,
      );
      await this.flushCandidates();
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      await this.emit("answer", answer);
    } else if (payload.kind === "answer") {
      await this.peer.setRemoteDescription(
        payload.data as RTCSessionDescriptionInit,
      );
      await this.flushCandidates();
    } else if (payload.kind === "ice" && payload.data) {
      const candidate = payload.data as RTCIceCandidateInit;
      if (!this.peer.remoteDescription) this.pendingCandidates.push(candidate);
      else await this.peer.addIceCandidate(candidate);
    }
  }

  send(data: string | ArrayBuffer): void {
    if (!this.channel || this.channel.readyState !== "open")
      throw new Error("Peer is not connected");
    if (typeof data === "string") this.channel.send(data);
    else this.channel.send(new Uint8Array(data));
  }

  async waitForBuffer(): Promise<void> {
    if (!this.channel || this.channel.bufferedAmount < MAX_BUFFER) return;
    this.channel.bufferedAmountLowThreshold = MAX_BUFFER / 2;
    await new Promise<void>((resolve) =>
      this.channel?.addEventListener("bufferedamountlow", () => resolve(), {
        once: true,
      }),
    );
  }

  close(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.channel?.close();
    this.peer.close();
    void this.signal.close();
  }

  private resetPeer(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    if (this.channel) {
      this.channel.onclose = null;
      this.channel.close();
    }
    this.peer.onconnectionstatechange = null;
    this.peer.close();
    this.channel = null;
    this.pendingCandidates = [];
    this.offerStarted = false;
    this.peer = this.createPeer();
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => this.onOpen?.();
    channel.onclose = () => this.onClose?.();
    channel.onmessage = ({ data }: MessageEvent<string | ArrayBuffer>) =>
      this.onMessage?.(data);
  }

  private async emit(
    kind: SignalPayload["kind"],
    data?: unknown,
  ): Promise<void> {
    await this.signal.send({ sender: this.sender, kind, data });
  }

  private async flushCandidates(): Promise<void> {
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await this.peer.addIceCandidate(candidate);
    }
  }
}
