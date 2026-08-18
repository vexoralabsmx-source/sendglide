import { z } from "zod";

export const PROTOCOL_VERSION = "SEND/1" as const;
export const CHUNK_SIZE = 64 * 1024;

const base = z.object({ protocol: z.literal(PROTOCOL_VERSION) });
const id = z.string().min(8).max(128);

export const fileMetadataSchema = z.object({
  transferId: id,
  name: z.string().min(1).max(255),
  mimeType: z.string().max(160),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(10 * 1024 ** 3),
  chunkSize: z
    .number()
    .int()
    .min(16 * 1024)
    .max(256 * 1024),
  totalChunks: z.number().int().nonnegative(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  sendOnce: z.boolean().default(false),
});

const deviceSchema = z.object({
  id,
  name: z.string().min(1).max(64),
  browser: z.string().max(40),
  platform: z.string().max(40),
});

export const sendMessageSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("hello"), device: deviceSchema }),
  base.extend({ type: z.literal("transfer-offer"), file: fileMetadataSchema }),
  base.extend({ type: z.literal("transfer-accept"), transferId: id }),
  base.extend({ type: z.literal("transfer-reject"), transferId: id }),
  base.extend({ type: z.literal("transfer-start"), transferId: id }),
  base.extend({
    type: z.literal("transfer-complete"),
    transferId: id,
    sha256: z.string().optional(),
  }),
  base.extend({
    type: z.literal("transfer-cancel"),
    transferId: id,
    reason: z.string().max(160).optional(),
  }),
  base.extend({
    type: z.literal("text"),
    transferId: id,
    text: z.string().max(1_000_000),
    kind: z.enum(["text", "url", "email", "phone", "code"]),
  }),
  base.extend({ type: z.literal("ping"), at: z.number() }),
  base.extend({ type: z.literal("pong"), at: z.number() }),
  base.extend({
    type: z.literal("error"),
    code: z.string().max(64),
    message: z.string().max(240),
  }),
]);

export type SendMessage = z.infer<typeof sendMessageSchema>;
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

export function parseSendMessage(value: unknown): SendMessage | null {
  const parsed = sendMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
