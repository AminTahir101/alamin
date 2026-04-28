"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { translations } from "./translations";
import type { Language } from "./translations";

type LanguageContextValue = {
  lang: Language;
  t: (typeof translations)[Language];
  isRTL: boolean;
  toggle: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>("en");

  useEffect(() => {
    const stored = localStorage.getItem("alamin_lang") as Language | null;
    if (stored === "ar" || stored === "en") setLang(stored);
  }, []);

  useEffect(() => {
    const isAr = lang === "ar";
    document.documentElement.lang = lang;
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    localStorage.setItem("alamin_lang", lang);
  }, [lang]);

  function toggle() {
    setLang((prev) => (prev === "en" ? "ar" : "en"));
  }

  return (
    <LanguageContext.Provider
      value={{ lang, t: translations[lang], isRTL: lang === "ar", toggle }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
