"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { detectLocale, type Locale } from "@/lib/i18n";

const legalCopy = {
  en: {
    back: "Back to SendGlide",
    switchLabel: "Change language",
    eyebrow: "PRIVACY",
    title: "Direct by design.",
    intro:
      "When a direct WebRTC connection succeeds, transferred content travels between the paired browsers and is not persisted by SendGlide. WebRTC encrypts data in transit.",
    infrastructureTitle: "What passes through our infrastructure",
    infrastructure:
      "Pairing and WebRTC signaling metadata may pass through Supabase infrastructure. Signaling exchanges connection descriptions and network candidates; it does not contain the files or text you transfer.",
    relayTitle: "Browser and relay limitations",
    relay:
      "Some networks require a TURN relay. In that case encrypted WebRTC packets pass through the relay, but the relay is not designed to store their contents. This project does not implement a cloud file fallback.",
    historyTitle: "Local history",
    history:
      "Anonymous transfer history exists only in the active browser session. “Send once” removes an item from SendGlide after opening; it cannot delete copies already saved by a recipient.",
  },
  es: {
    back: "Volver a SendGlide",
    switchLabel: "Cambiar idioma",
    eyebrow: "PRIVACIDAD",
    title: "Directo por diseño.",
    intro:
      "Cuando la conexión WebRTC directa funciona, el contenido viaja entre los navegadores conectados y SendGlide no lo almacena. WebRTC cifra los datos durante la transferencia.",
    infrastructureTitle: "Qué pasa por nuestra infraestructura",
    infrastructure:
      "Los metadatos de conexión y señalización WebRTC pueden pasar por la infraestructura de Supabase. La señalización intercambia descripciones de conexión y candidatos de red; no incluye los archivos ni el texto que transfieres.",
    relayTitle: "Limitaciones del navegador y los relés",
    relay:
      "Algunas redes necesitan un relé TURN. En ese caso, los paquetes WebRTC cifrados pasan por el relé, pero éste no está diseñado para almacenar su contenido. Este proyecto no usa almacenamiento de archivos en la nube como alternativa.",
    historyTitle: "Historial local",
    history:
      "El historial anónimo de transferencias sólo existe durante la sesión activa del navegador. “Enviar una vez” quita el elemento de SendGlide después de abrirlo, pero no puede borrar copias que el destinatario ya haya guardado.",
  },
} as const;

export function PrivacyContent() {
  const [locale, setLocale] = useState<Locale>("en");
  const text = legalCopy[locale];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("sendglide-locale");
      setLocale(
        saved === "en" || saved === "es"
          ? saved
          : detectLocale(navigator.language),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const changeLocale = (next: Locale) => {
    setLocale(next);
    window.localStorage.setItem("sendglide-locale", next);
  };

  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link href="/" className="brand" aria-label={text.back}>
          <ArrowLeft size={17} />
          <Image
            className="brand-logo"
            src="/sendglide-logo-64.png"
            width={36}
            height={36}
            alt=""
            priority
          />
          SENDGLIDE
        </Link>
        <div
          className="language-switch"
          role="group"
          aria-label={text.switchLabel}
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
      </header>
      <article>
        <p className="eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
        <h2>{text.infrastructureTitle}</h2>
        <p>{text.infrastructure}</p>
        <h2>{text.relayTitle}</h2>
        <p>{text.relay}</p>
        <h2>{text.historyTitle}</h2>
        <p>{text.history}</p>
      </article>
    </main>
  );
}
