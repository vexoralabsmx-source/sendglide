"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import QRCode from "qrcode";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Copy,
  FileUp,
  FolderOpen,
  Globe2,
  Image as ImageIcon,
  Link2,
  Languages,
  LockKeyhole,
  Monitor,
  MousePointer2,
  Paperclip,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Unplug,
  Zap,
  X,
} from "lucide-react";
import { detectContentKind, safeUrl } from "@/lib/content";
import { getDeviceInfo, type DeviceInfo } from "@/lib/device";
import {
  generatePairingCode,
  normalizePairingCode,
  randomId,
} from "@/lib/pairing";
import {
  PROTOCOL_VERSION,
  parseSendMessage,
  type FileMetadata,
  type SendMessage,
} from "@/lib/protocol/send";
import {
  connectSignaling,
  type SignalConnection,
  type SignalPayload,
} from "@/lib/signaling";
import {
  assembleChunks,
  createFileMetadata,
  formatBytes,
  sha256,
} from "@/lib/transfer";
import { WebRTCTransport } from "@/lib/webrtc";
import { copy, detectLocale, type Locale } from "@/lib/i18n";

const MoltenMetal = dynamic(
  () =>
    import("@/components/molten-metal").then((module) => module.MoltenMetal),
  { ssr: false },
);

type ConnectionState =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "expired"
  | "error";
type PairRole = "host" | "guest" | null;
type PairingPhase = "idle" | "finding" | "negotiating" | "ready" | "failed";
type Transfer = {
  id: string;
  name: string;
  size: number;
  direction: "in" | "out";
  progress: number;
  status:
    "waiting" | "receiving" | "sending" | "complete" | "declined" | "failed";
  verified?: boolean;
  url?: string;
  mimeType?: string;
  text?: string;
  kind?: string;
  sendOnce?: boolean;
};

type WithoutProtocol<T> = T extends SendMessage ? Omit<T, "protocol"> : never;
function message(value: WithoutProtocol<SendMessage>): SendMessage {
  return { protocol: PROTOCOL_VERSION, ...value } as SendMessage;
}

export function SendGlideApp({ initialCode }: { initialCode?: string }) {
  const reduceMotion = useReducedMotion();
  const [locale, setLocale] = useState<Locale>("en");
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [pairOpen, setPairOpen] = useState(Boolean(initialCode));
  const [pairRole, setPairRole] = useState<PairRole>(
    initialCode ? "guest" : null,
  );
  const [pairingPhase, setPairingPhase] = useState<PairingPhase>(
    initialCode ? "finding" : "idle",
  );
  const [code, setCode] = useState(
    initialCode ? normalizePairingCode(initialCode) : "",
  );
  const [joinCode, setJoinCode] = useState(
    initialCode ? normalizePairingCode(initialCode) : "",
  );
  const [qr, setQr] = useState("");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [peer, setPeer] = useState<DeviceInfo | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [incoming, setIncoming] = useState<FileMetadata | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const transport = useRef<WebRTCTransport | null>(null);
  const signal = useRef<SignalConnection | null>(null);
  const fileQueue = useRef(new Map<string, File>());
  const pendingFiles = useRef<File[]>([]);
  const incomingMeta = useRef<FileMetadata | null>(null);
  const incomingChunks = useRef<ArrayBuffer[]>([]);
  const incomingBytes = useRef(0);
  const offerQueue = useRef<FileMetadata[]>([]);
  const receivedFiles = useRef(new Map<string, Blob>());
  const inputRef = useRef<HTMLInputElement>(null);
  const expiryTimer = useRef<number | null>(null);
  const connectionTimer = useRef<number | null>(null);
  const joinRetryTimer = useRef<number | null>(null);
  const connectionAttempt = useRef(0);
  const localeRef = useRef<Locale>("en");
  const t = copy[locale];
  const activeTransfer = transfers.find(
    (item) => item.status === "sending" || item.status === "receiving",
  );
  const reveal = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDevice(getDeviceInfo()));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    localeRef.current = locale;
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("sendglide-locale");
      const next =
        saved === "es" || saved === "en"
          ? saved
          : detectLocale(navigator.language);
      localeRef.current = next;
      setLocale(next);
      document.documentElement.lang = next;
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(
    () => () => {
      transport.current?.close();
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      if (connectionTimer.current) clearTimeout(connectionTimer.current);
      if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
    },
    [],
  );

  const changeLocale = (next: Locale) => {
    localeRef.current = next;
    setLocale(next);
    window.localStorage.setItem("sendglide-locale", next);
  };
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;
    void navigator.serviceWorker.register("/sw.js");
  }, []);
  useEffect(() => {
    if (!code) return;
    const url = `${window.location.origin}/p/${code}`;
    void QRCode.toDataURL(url, {
      width: 360,
      margin: 1,
      color: { dark: "#111312", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setQr);
  }, [code]);

  const updateTransfer = useCallback(
    (id: string, patch: Partial<Transfer>) =>
      setTransfers((items) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      ),
    [],
  );

  const sendProtocol = useCallback((payload: SendMessage) => {
    try {
      transport.current?.send(JSON.stringify(payload));
    } catch {
      setNotice(copy[localeRef.current].notice.peerNotReady);
    }
  }, []);

  const offerSelectedFiles = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        const metadata = createFileMetadata(file);
        fileQueue.current.set(metadata.transferId, file);
        setTransfers((items) => [
          {
            id: metadata.transferId,
            name: metadata.name,
            size: metadata.size,
            direction: "out",
            progress: 0,
            status: "waiting",
          },
          ...items,
        ]);
        sendProtocol(message({ type: "transfer-offer", file: metadata }));
      });
    },
    [sendProtocol],
  );

  useEffect(() => {
    if (connection !== "connected") return;
    const heartbeat = window.setInterval(
      () => sendProtocol(message({ type: "ping", at: Date.now() })),
      15_000,
    );
    return () => window.clearInterval(heartbeat);
  }, [connection, sendProtocol]);

  const sendFileData = useCallback(
    async (metadata: FileMetadata) => {
      const file = fileQueue.current.get(metadata.transferId);
      if (!file || !transport.current) return;
      updateTransfer(metadata.transferId, { status: "sending" });
      sendProtocol(
        message({ type: "transfer-start", transferId: metadata.transferId }),
      );
      const started = performance.now();
      for (let offset = 0; offset < file.size; offset += metadata.chunkSize) {
        await transport.current.waitForBuffer();
        transport.current.send(
          await file.slice(offset, offset + metadata.chunkSize).arrayBuffer(),
        );
        const sent = Math.min(offset + metadata.chunkSize, file.size);
        updateTransfer(metadata.transferId, {
          progress: file.size ? sent / file.size : 1,
        });
      }
      const checksum = await sha256(file);
      sendProtocol(
        message({
          type: "transfer-complete",
          transferId: metadata.transferId,
          sha256: checksum,
        }),
      );
      updateTransfer(metadata.transferId, {
        status: "complete",
        progress: 1,
        verified: true,
      });
      fileQueue.current.delete(metadata.transferId);
      if (performance.now() - started < 200)
        await new Promise((resolve) => setTimeout(resolve, 200));
    },
    [sendProtocol, updateTransfer],
  );

  const handleProtocol = useCallback(
    async (payload: SendMessage) => {
      switch (payload.type) {
        case "hello":
          setPeer(payload.device);
          break;
        case "transfer-offer":
          offerQueue.current.push(payload.file);
          setIncoming((current) => current ?? payload.file);
          setTransfers((items) => [
            {
              id: payload.file.transferId,
              name: payload.file.name,
              size: payload.file.size,
              direction: "in",
              progress: 0,
              status: "waiting",
              mimeType: payload.file.mimeType,
              sendOnce: payload.file.sendOnce,
            },
            ...items,
          ]);
          break;
        case "transfer-accept": {
          const meta = fileQueue.current.get(payload.transferId);
          if (meta) {
            const metadata = createFileMetadata(meta);
            metadata.transferId = payload.transferId;
            void sendFileData(metadata);
          }
          break;
        }
        case "transfer-reject":
          updateTransfer(payload.transferId, { status: "declined" });
          fileQueue.current.delete(payload.transferId);
          break;
        case "transfer-start": {
          updateTransfer(payload.transferId, { status: "receiving" });
          const meta = incomingMeta.current;
          if (meta?.transferId === payload.transferId && meta.size === 0) {
            const blob = new Blob([], { type: meta.mimeType });
            receivedFiles.current.set(meta.transferId, blob);
            updateTransfer(meta.transferId, {
              status: "complete",
              progress: 1,
              url: URL.createObjectURL(blob),
            });
            incomingMeta.current = null;
            setIncoming(offerQueue.current[0] ?? null);
          }
          break;
        }
        case "transfer-complete": {
          const received = receivedFiles.current.get(payload.transferId);
          if (received && payload.sha256) {
            const actual = await sha256(received);
            updateTransfer(payload.transferId, {
              verified: actual === payload.sha256,
              status: actual === payload.sha256 ? "complete" : "failed",
            });
          }
          break;
        }
        case "transfer-cancel":
          updateTransfer(payload.transferId, { status: "failed" });
          break;
        case "text":
          setTransfers((items) => [
            {
              id: payload.transferId,
              name:
                payload.kind === "url"
                  ? copy[localeRef.current].linkLabel
                  : copy[localeRef.current].textLabel,
              size: new Blob([payload.text]).size,
              direction: "in",
              progress: 1,
              status: "complete",
              verified: true,
              text: payload.text,
              kind: payload.kind,
            },
            ...items,
          ]);
          break;
        case "ping":
          sendProtocol(message({ type: "pong", at: payload.at }));
          break;
        default:
          break;
      }
    },
    [sendFileData, sendProtocol, updateTransfer],
  );

  const handleData = useCallback(
    (data: string | ArrayBuffer) => {
      if (typeof data === "string") {
        try {
          const parsed = parseSendMessage(JSON.parse(data));
          if (parsed) void handleProtocol(parsed);
        } catch {
          setNotice(copy[localeRef.current].notice.malformed);
        }
        return;
      }
      const meta = incomingMeta.current;
      if (!meta) return;
      incomingChunks.current.push(data);
      incomingBytes.current += data.byteLength;
      const received = incomingBytes.current;
      updateTransfer(meta.transferId, {
        status: "receiving",
        progress: meta.size ? Math.min(received / meta.size, 1) : 1,
      });
      if (received >= meta.size) {
        const blob = assembleChunks(incomingChunks.current, meta.mimeType);
        const url = URL.createObjectURL(blob);
        receivedFiles.current.set(meta.transferId, blob);
        updateTransfer(meta.transferId, {
          status: "complete",
          progress: 1,
          url,
        });
        incomingMeta.current = null;
        incomingChunks.current = [];
        incomingBytes.current = 0;
        setIncoming(offerQueue.current[0] ?? null);
      }
    },
    [handleProtocol, updateTransfer],
  );

  const connect = useCallback(
    async (room: string, host: boolean) => {
      const attempt = ++connectionAttempt.current;
      const translated = copy[localeRef.current];
      if (!device || !("RTCPeerConnection" in window)) {
        setNotice(translated.notice.unsupported);
        setConnection("error");
        setPairingPhase("failed");
        return;
      }
      const normalized = normalizePairingCode(room);
      if (normalized.length !== 6) {
        setNotice(translated.notice.incompleteCode);
        return;
      }
      transport.current?.close();
      transport.current = null;
      if (signal.current) void signal.current.close();
      signal.current = null;
      if (connectionTimer.current) clearTimeout(connectionTimer.current);
      if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
      setCode(normalized);
      setJoinCode(normalized);
      setPairRole(host ? "host" : "guest");
      setPairingPhase(host ? "idle" : "finding");
      setNotice("");
      setConnection(host ? "waiting" : "connecting");
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      expiryTimer.current = window.setTimeout(
        () => {
          transport.current?.close();
          setConnection("expired");
          setPairingPhase("failed");
          setNotice(copy[localeRef.current].notice.expired);
        },
        60 * 60 * 1000,
      );
      let rtc: WebRTCTransport | null = null;
      let signaling: SignalConnection;
      try {
        signaling = await connectSignaling(
          normalized,
          (payload: SignalPayload) => {
            if (payload.sender === device.id) return;
            if (host && payload.kind === "join") void rtc?.startOffer();
            else
              void rtc?.handleSignal(payload).catch(() => {
                setPairingPhase("failed");
                setConnection("error");
                setNotice(copy[localeRef.current].notice.timeout);
              });
          },
        );
      } catch {
        if (attempt !== connectionAttempt.current) return;
        setConnection("error");
        setPairingPhase("failed");
        setNotice(copy[localeRef.current].notice.signaling);
        return;
      }
      if (attempt !== connectionAttempt.current) {
        await signaling.close();
        return;
      }
      signal.current = signaling;
      const iceServers = await fetch("/api/ice")
        .then((response) =>
          response.ok
            ? (response.json() as Promise<RTCIceServer[]>)
            : [{ urls: "stun:stun.l.google.com:19302" }],
        )
        .catch(() => [{ urls: "stun:stun.l.google.com:19302" }]);
      rtc = new WebRTCTransport(signaling, device.id, iceServers);
      if (attempt !== connectionAttempt.current) {
        rtc.close();
        return;
      }
      transport.current = rtc;
      if (!host) setPairingPhase("negotiating");
      rtc.onOpen = () => {
        if (attempt !== connectionAttempt.current) return;
        if (connectionTimer.current) clearTimeout(connectionTimer.current);
        if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
        connectionTimer.current = null;
        joinRetryTimer.current = null;
        setPairingPhase("ready");
        setConnection("connected");
        setPairOpen(false);
        sendProtocol(message({ type: "hello", device }));
        if (pendingFiles.current.length) {
          offerSelectedFiles(pendingFiles.current);
          pendingFiles.current = [];
          setPendingFileCount(0);
          setNotice(copy[localeRef.current].notice.queuedConnected);
        }
      };
      rtc.onClose = () => {
        if (attempt !== connectionAttempt.current) return;
        if (connectionTimer.current) clearTimeout(connectionTimer.current);
        if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
        connectionTimer.current = null;
        joinRetryTimer.current = null;
        setConnection((current) =>
          current === "connected" ? "disconnected" : "error",
        );
        setPairingPhase((current) =>
          current === "ready" ? current : "failed",
        );
      };
      rtc.onMessage = handleData;
      if (!host) {
        const announce = () =>
          signaling
            .send({ sender: device.id, kind: "join" })
            .catch(() => undefined);
        await announce();
        joinRetryTimer.current = window.setInterval(announce, 1_800);
        connectionTimer.current = window.setTimeout(() => {
          if (attempt !== connectionAttempt.current) return;
          if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
          joinRetryTimer.current = null;
          rtc?.close();
          setPairingPhase("failed");
          setConnection("error");
          setNotice(copy[localeRef.current].notice.timeout);
        }, 20_000);
      }
    },
    [device, handleData, offerSelectedFiles, sendProtocol],
  );

  useEffect(() => {
    if (!initialCode || !device) return;
    const frame = requestAnimationFrame(() => void connect(initialCode, false));
    return () => cancelAnimationFrame(frame);
  }, [connect, device, initialCode]);

  const createSession = () => {
    const next = normalizePairingCode(generatePairingCode());
    setPairOpen(true);
    void connect(next, true);
  };
  const openJoin = () => {
    connectionAttempt.current += 1;
    transport.current?.close();
    transport.current = null;
    if (signal.current) void signal.current.close();
    signal.current = null;
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
    setPairRole("guest");
    setPairingPhase("idle");
    setConnection("idle");
    setCode("");
    setJoinCode("");
    setPairOpen(true);
  };
  const offerFiles = useCallback(
    (files: FileList | File[]) => {
      const selected = Array.from(files);
      if (!selected.length) return;
      if (connection !== "connected") {
        pendingFiles.current.push(...selected);
        setPendingFileCount(pendingFiles.current.length);
        setNotice(
          copy[localeRef.current].notice.queued(pendingFiles.current.length),
        );
        setPairRole(null);
        setPairingPhase("idle");
        setPairOpen(true);
        return;
      }
      offerSelectedFiles(selected);
    },
    [connection, offerSelectedFiles],
  );
  const sendText = () => {
    const value = text.trim();
    if (!value || connection !== "connected") {
      if (connection !== "connected")
        setNotice(copy[localeRef.current].notice.connectForText);
      return;
    }
    const kind = detectContentKind(value);
    const id = randomId();
    sendProtocol(message({ type: "text", transferId: id, text: value, kind }));
    setTransfers((items) => [
      {
        id,
        name:
          kind === "url"
            ? copy[localeRef.current].linkLabel
            : copy[localeRef.current].textLabel,
        size: new Blob([value]).size,
        direction: "out",
        progress: 1,
        status: "complete",
        verified: true,
        text: value,
        kind,
      },
      ...items,
    ]);
    setText("");
  };
  const accept = () => {
    if (!incoming) return;
    offerQueue.current = offerQueue.current.filter(
      (offer) => offer.transferId !== incoming.transferId,
    );
    incomingMeta.current = incoming;
    incomingChunks.current = [];
    incomingBytes.current = 0;
    sendProtocol(
      message({ type: "transfer-accept", transferId: incoming.transferId }),
    );
    updateTransfer(incoming.transferId, { status: "receiving" });
    setIncoming(null);
  };
  const reject = () => {
    if (!incoming) return;
    offerQueue.current = offerQueue.current.filter(
      (offer) => offer.transferId !== incoming.transferId,
    );
    sendProtocol(
      message({ type: "transfer-reject", transferId: incoming.transferId }),
    );
    updateTransfer(incoming.transferId, { status: "declined" });
    setIncoming(offerQueue.current[0] ?? null);
  };
  const disconnect = () => {
    connectionAttempt.current += 1;
    transport.current?.close();
    transport.current = null;
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    if (joinRetryTimer.current) clearInterval(joinRetryTimer.current);
    setConnection("idle");
    setPairRole(null);
    setPairingPhase("idle");
    setPeer(null);
    setCode("");
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (files?.length) offerFiles(files);
      else {
        const value = event.clipboardData?.getData("text");
        if (
          value &&
          !(
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
          )
        )
          setText(value);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [offerFiles]);

  return (
    <main className="app-shell">
      <div className="ambient" aria-hidden="true">
        <MoltenMetal
          className="molten-page-background"
          color1="#000000"
          color2="#fffdff"
          color3="#575757"
          speed={0.16}
          scale={3.3}
          detail={3}
          glow={1.35}
          coreSize={0.07}
          swirl={0.75}
          fold={-0.18}
          blackPoint={0.09}
          brightness={1.05}
          grainIntensity={0.018}
          mouseStrength={0.12}
          opacity={0.42}
        />
        <i className="ambient-one" />
        <i className="ambient-two" />
        <span />
      </div>
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link href="/" className="brand" aria-label={t.homeLabel}>
          <BrandMark />
          <span>SENDGLIDE</span>
        </Link>
        <nav aria-label={t.primaryNav}>
          <a href="#how-it-works">{t.howNav}</a>
          <a href="#privacy">{t.privacyNav}</a>
        </nav>
        <div className="header-actions">
          <motion.div
            layout
            className={`status-pill status-${connection}`}
            aria-live="polite"
          >
            <span />
            {t.status[connection]}
          </motion.div>
          <div
            className="language-switch"
            role="group"
            aria-label={t.switchLanguage}
          >
            <Languages size={15} aria-hidden="true" />
            {(["es", "en"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={locale === option ? "active" : ""}
                aria-pressed={locale === option}
                onClick={() => changeLocale(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </motion.header>
      <section className="hero">
        <motion.div
          className="hero-copy"
          {...reveal}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">
            <i /> {t.eyebrow}
          </p>
          <h1>
            <motion.span
              className="hero-line hero-line-primary"
              initial={reduceMotion ? false : { y: "105%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
            >
              {t.heroPrimary}
            </motion.span>
            <motion.span
              className="hero-line hero-line-muted"
              initial={reduceMotion ? false : { y: "105%" }}
              animate={{ y: 0 }}
              transition={{
                duration: 0.72,
                delay: 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {t.heroMuted}
            </motion.span>
          </h1>
          <div className="hero-bottom">
            <p className="lede">{t.lede}</p>
            <div className="protocol-stamp">
              <Radio size={15} />
              <span>SEND/1</span>
              <small>{t.liveProtocol}</small>
            </div>
          </div>
        </motion.div>
      </section>

      <motion.section
        className="workspace"
        aria-label={t.workspaceLabel}
        initial={reduceMotion ? false : { opacity: 0, y: 38, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="workspace-bar" aria-hidden="true">
          <div>
            <span />
            <span />
            <span />
          </div>
          <p>{t.transferConsole}</p>
          <small>
            {connection === "connected" ? t.peerOnline : t.awaitingPeer}
          </small>
        </div>
        <AnimatePresence mode="popLayout">
          {connection === "connected" && device && peer ? (
            <motion.div
              className="device-flow"
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
            >
              <DeviceCard device={device} local labels={t} />
              <div
                className={`glide-line ${activeTransfer ? "is-transferring" : ""}`}
              >
                <i />
                <motion.span
                  animate={
                    activeTransfer
                      ? {
                          left: `${Math.min(activeTransfer.progress * 100, 98)}%`,
                        }
                      : { left: ["2%", "96%", "2%"] }
                  }
                  transition={
                    activeTransfer
                      ? { duration: 0.18, ease: "easeOut" }
                      : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                  }
                />
                <small>
                  {activeTransfer
                    ? `${Math.round(activeTransfer.progress * 100)}% ${t.gliding}`
                    : t.encryptedLink}
                </small>
              </div>
              <DeviceCard device={peer} labels={t} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <motion.button
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          animate={dragging ? { scale: 0.992 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            offerFiles(e.dataTransfer.files);
          }}
        >
          <span className="drop-grid" aria-hidden="true" />
          <span className="drop-beam" aria-hidden="true" />
          <span className="drop-icon">
            <i />
            <i />
            <ArrowDownToLine size={27} />
          </span>
          <strong>
            {connection === "connected"
              ? t.dropConnected
              : pendingFileCount
                ? t.readyFiles(pendingFileCount)
                : t.dropDisconnected}
          </strong>
          <span>{t.contentKinds}</span>
          <small>
            <MousePointer2 size={13} /> {t.dropHint}
          </small>
        </motion.button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          multiple
          aria-label={t.chooseFiles}
          onChange={(e) => e.target.files && offerFiles(e.target.files)}
        />
        <div className="quick-actions">
          {connection === "connected" ? (
            <>
              <button onClick={() => inputRef.current?.click()}>
                <Paperclip size={18} />
                {t.chooseFiles}
              </button>
              <label>
                <ImageIcon size={18} />
                {t.takePhoto}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => e.target.files && offerFiles(e.target.files)}
                />
              </label>
              <button onClick={disconnect}>
                <Unplug size={18} />
                {t.disconnect}
              </button>
            </>
          ) : (
            <>
              <motion.button
                className="primary magnetic-cta"
                onClick={createSession}
                whileHover={reduceMotion ? undefined : { y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <span>{t.connectDevice}</span>
                <i>
                  <ArrowRight size={18} />
                </i>
              </motion.button>
              <button className="code-entry-button" onClick={openJoin}>
                <ScanLine size={17} />
                {t.enterCode}
              </button>
            </>
          )}
        </div>
        {connection === "connected" ? (
          <div className="text-send">
            <label htmlFor="text-share">{t.sendTextLabel}</label>
            <div>
              <textarea
                id="text-share"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.sendTextPlaceholder}
                rows={2}
              />
              <button
                onClick={sendText}
                disabled={!text.trim()}
                aria-label={t.sendText}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        ) : null}
      </motion.section>

      {transfers.length ? (
        <motion.section
          className="transfer-list"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="section-heading">
            <p className="eyebrow">{t.transfers}</p>
            <button
              onClick={() =>
                setTransfers((items) =>
                  items.filter((item) => item.status !== "complete"),
                )
              }
            >
              {t.clearCompleted}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {transfers.map((item) => (
              <TransferRow
                key={item.id}
                item={item}
                labels={t}
                onRemove={() =>
                  setTransfers((items) =>
                    items.filter((entry) => entry.id !== item.id),
                  )
                }
              />
            ))}
          </AnimatePresence>
        </motion.section>
      ) : null}

      <motion.section
        className="trust-row"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.55 }}
      >
        <div className="trust-card">
          <Globe2 />
          <strong>{t.worksEverywhere}</strong>
          <span>{t.modernBrowser}</span>
        </div>
        <div className="trust-card featured">
          <ShieldCheck />
          <strong>{t.directTransfer}</strong>
          <span>{t.encryptedWebrtc}</span>
        </div>
        <div className="trust-card">
          <Clipboard />
          <strong>{t.noAccount}</strong>
          <span>{t.pairAndGo}</span>
        </div>
      </motion.section>

      <section className="how-section" id="how-it-works">
        <motion.div
          className="how-heading"
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
        >
          <p className="eyebrow">
            <i /> {t.howEyebrow}
          </p>
          <h2>
            {t.howTitle}
            <br />
            <span>{t.howAccent}</span>
          </h2>
        </motion.div>
        <div className="steps-grid">
          <StepCard
            number="01"
            icon={<ScanLine />}
            title={t.scan}
            copy={t.scanCopy}
            delay={0}
            reduced={Boolean(reduceMotion)}
          />
          <StepCard
            number="02"
            icon={<Zap />}
            title={t.connect}
            copy={t.connectCopy}
            delay={0.06}
            reduced={Boolean(reduceMotion)}
          />
          <StepCard
            number="03"
            icon={<FileUp />}
            title={t.glide}
            copy={t.glideCopy}
            delay={0.12}
            reduced={Boolean(reduceMotion)}
          />
        </div>
      </section>

      <section className="privacy-banner" id="privacy">
        <div className="privacy-orbit" aria-hidden="true">
          <i />
          <span>
            <LockKeyhole />
          </span>
        </div>
        <div>
          <p className="eyebrow">{t.privateArchitecture}</p>
          <h2>{t.privacyTitle}</h2>
          <p>{t.privacyCopy}</p>
        </div>
        <Link href="/privacy">
          {t.privacyLink} <ArrowUpRight size={16} />
        </Link>
      </section>

      <footer>
        <span>© {new Date().getFullYear()} SendGlide</span>
        <Link href="/privacy">{t.footerPrivacy}</Link>
        <span>{t.footerClaim}</span>
      </footer>

      <AnimatePresence>
        {pairOpen ? (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className="pair-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pair-title"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <div
                className="modal-language"
                role="group"
                aria-label={t.switchLanguage}
              >
                {(["es", "en"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={locale === option ? "active" : ""}
                    aria-pressed={locale === option}
                    onClick={() => changeLocale(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                className="modal-close"
                onClick={() => setPairOpen(false)}
                aria-label={t.modal.close}
              >
                <X />
              </button>
              <p className="eyebrow">{t.modal.eyebrow}</p>
              <h2 id="pair-title">
                {pairRole === "host"
                  ? t.modal.hostTitle
                  : pairRole === "guest"
                    ? t.modal.guestTitle
                    : t.modal.chooseTitle}
              </h2>
              <p className="pair-intro">
                {pairRole === "host"
                  ? t.modal.hostCopy
                  : pairRole === "guest"
                    ? t.modal.guestCopy
                    : t.modal.chooseCopy}
              </p>
              {pendingFileCount ? (
                <div className="queued-files" role="status">
                  <Paperclip size={15} />
                  {t.modal.queuedFile(pendingFileCount)}
                </div>
              ) : null}
              {pairRole === null ? (
                <div className="pair-choices">
                  <button
                    className="pair-choice primary-choice"
                    onClick={createSession}
                  >
                    <span>
                      <ScanLine />
                    </span>
                    <div>
                      <strong>{t.modal.createTitle}</strong>
                      <small>{t.modal.createCopy}</small>
                    </div>
                    <ChevronRight />
                  </button>
                  <button className="pair-choice" onClick={openJoin}>
                    <span>
                      <Link2 />
                    </span>
                    <div>
                      <strong>{t.modal.joinTitle}</strong>
                      <small>{t.modal.joinCopy}</small>
                    </div>
                    <ChevronRight />
                  </button>
                </div>
              ) : null}
              {pairRole === "host" ? (
                <>
                  <div className="qr-wrap">
                    {qr ? (
                      <Image
                        src={qr}
                        width={170}
                        height={170}
                        unoptimized
                        alt={t.modal.scanQr(code)}
                      />
                    ) : null}
                  </div>
                  <p className="or">{t.modal.orEnter}</p>
                  <button
                    className="pair-code"
                    onClick={() => {
                      void navigator.clipboard.writeText(code);
                      setNotice(t.modal.copied);
                    }}
                    aria-label={t.modal.copyCode}
                  >
                    {code.slice(0, 3)}-{code.slice(3)} <Copy size={16} />
                  </button>
                  <div className="waiting">
                    <span />
                    {t.modal.waiting}
                  </div>
                  <button className="pair-secondary" onClick={openJoin}>
                    {t.modal.useCode}
                  </button>
                </>
              ) : null}
              {pairRole === "guest" ? (
                <div className="guest-pairing">
                  {pairingPhase === "idle" || !code ? (
                    <>
                      <label className="join-label" htmlFor="pair-code-input">
                        {t.modal.codeLabel}
                        <input
                          id="pair-code-input"
                          value={joinCode}
                          onChange={(e) =>
                            setJoinCode(normalizePairingCode(e.target.value))
                          }
                          placeholder="ABC-123"
                          autoCapitalize="characters"
                          autoComplete="off"
                          inputMode="text"
                          maxLength={7}
                          aria-describedby="pair-code-hint"
                        />
                      </label>
                      <small id="pair-code-hint" className="field-hint">
                        {t.modal.codeHint}
                      </small>
                      <button
                        className="join-button"
                        onClick={() => void connect(joinCode, false)}
                        disabled={joinCode.length !== 6}
                      >
                        {t.modal.join}
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className={`device-bridge phase-${pairingPhase}`}
                        aria-hidden="true"
                      >
                        <span>
                          <Smartphone />
                        </span>
                        <i>
                          <b />
                        </i>
                        <span>
                          <Monitor />
                        </span>
                      </div>
                      <button
                        className="pair-code compact"
                        onClick={() => void navigator.clipboard.writeText(code)}
                        aria-label={t.modal.copyCode}
                      >
                        {code.slice(0, 3)}-{code.slice(3)} <Copy size={15} />
                      </button>
                      <div
                        className="pair-progress"
                        role="status"
                        aria-live="polite"
                      >
                        <span className="done">
                          <i>
                            <Check />
                          </i>
                          {t.modal.progressOne}
                        </span>
                        <span
                          className={
                            pairingPhase === "negotiating" ||
                            pairingPhase === "ready"
                              ? "active"
                              : ""
                          }
                        >
                          <i>2</i>
                          {t.modal.progressTwo}
                        </span>
                        <span
                          className={pairingPhase === "ready" ? "active" : ""}
                        >
                          <i>3</i>
                          {t.modal.progressThree}
                        </span>
                      </div>
                      <div
                        className={`pair-status ${pairingPhase === "failed" ? "failed" : ""}`}
                      >
                        {pairingPhase === "failed" ? <CircleAlert /> : <span />}
                        <div>
                          <strong>
                            {pairingPhase === "failed"
                              ? t.modal.failed
                              : pairingPhase === "ready"
                                ? t.modal.connected
                                : pairingPhase === "negotiating"
                                  ? t.modal.negotiating
                                  : t.modal.finding}
                          </strong>
                          {pairingPhase === "failed" ? (
                            <small>{t.modal.failedHelp}</small>
                          ) : null}
                        </div>
                      </div>
                      {pairingPhase === "failed" ? (
                        <button
                          className="join-button"
                          onClick={() => void connect(code, false)}
                        >
                          <RotateCcw size={17} /> {t.modal.retry}
                        </button>
                      ) : null}
                    </>
                  )}
                  <button
                    className="pair-secondary"
                    onClick={() => {
                      disconnect();
                      setPairRole(null);
                      setPairOpen(true);
                    }}
                  >
                    {t.modal.back}
                  </button>
                </div>
              ) : null}
              <small className="pair-footnote">{t.modal.temporary}</small>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {incoming ? (
          <motion.div
            className="incoming"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            role="alertdialog"
          >
            <div className="incoming-icon">
              <FileUp />
            </div>
            <div>
              <span>{t.incoming(peer?.name || t.pairedDevice)}</span>
              <strong>{incoming.name}</strong>
              <small>{formatBytes(incoming.size)}</small>
            </div>
            <div>
              <button onClick={reject}>{t.decline}</button>
              <button className="primary" onClick={accept}>
                {t.receive}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {notice ? (
          <motion.div
            className="notice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
          >
            <CircleAlert size={18} />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label={t.dismiss}>
              <X size={16} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function DeviceCard({
  device,
  local = false,
  labels,
}: {
  device: DeviceInfo;
  local?: boolean;
  labels: (typeof copy)[Locale];
}) {
  const phone = /iOS|Android/.test(device.platform);
  return (
    <motion.div
      className="device-card"
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      {phone ? <Smartphone /> : <Monitor />}
      <div>
        <small>{local ? labels.thisDevice : labels.pairedDeviceLabel}</small>
        <strong>{device.name}</strong>
        <span>
          {device.browser} · {device.platform}
        </span>
      </div>
      <i />
    </motion.div>
  );
}

function TransferRow({
  item,
  onRemove,
  labels,
}: {
  item: Transfer;
  onRemove: () => void;
  labels: (typeof copy)[Locale];
}) {
  const url = item.kind === "url" && item.text ? safeUrl(item.text) : null;
  const open = () => {
    if (item.url) {
      const anchor = document.createElement("a");
      anchor.href = item.url;
      anchor.download = item.name;
      anchor.click();
    }
  };
  return (
    <motion.article
      layout
      className={`transfer-row transfer-${item.status}`}
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      <div className="file-glyph">{item.text ? <Link2 /> : <FolderOpen />}</div>
      <div className="transfer-main">
        <div>
          <strong>{item.name}</strong>
          <span>
            {item.direction === "in" ? labels.received : labels.sent} ·{" "}
            {formatBytes(item.size)}
          </span>
        </div>
        {item.text ? (
          <p>{item.text}</p>
        ) : (
          <div className="progress-track">
            <i style={{ transform: `scaleX(${item.progress})` }} />
          </div>
        )}
        <small>
          {item.status === "complete" ? (
            item.verified ? (
              <>
                <Check size={13} /> {labels.verified}
              </>
            ) : (
              labels.complete
            )
          ) : (
            `${Math.round(item.progress * 100)}% · ${item.status}`
          )}
        </small>
      </div>
      <div className="transfer-actions">
        {item.text && (
          <button
            onClick={() => void navigator.clipboard.writeText(item.text || "")}
          >
            <Copy size={16} />
            {labels.copy}
          </button>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            {labels.open}
          </a>
        )}
        {item.url && <button onClick={open}>{labels.download}</button>}
        <button
          className="icon-button"
          onClick={onRemove}
          aria-label={labels.remove(item.name)}
        >
          <X size={17} />
        </button>
      </div>
    </motion.article>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <ArrowRight size={14} />
    </span>
  );
}

function StepCard({
  number,
  icon,
  title,
  copy,
  delay,
  reduced,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  copy: string;
  delay: number;
  reduced: boolean;
}) {
  return (
    <motion.article
      className="step-card"
      initial={reduced ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="step-number">{number}</span>
      <div className="step-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
      <i className="step-line" />
    </motion.article>
  );
}
