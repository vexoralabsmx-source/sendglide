import type { Metadata } from "next";
import { SendGlideApp } from "@/components/sendglide-app";
export const metadata: Metadata = { title: "Pair a device" };
export default async function PairPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SendGlideApp initialCode={code} />;
}
