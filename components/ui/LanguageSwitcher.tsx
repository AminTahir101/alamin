"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, toggle } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={lang === "en" ? "Switch to Arabic" : "Switch to English"}
      className={[
        "inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {lang === "en" ? "العربية" : "English"}
    </button>
  );
}
