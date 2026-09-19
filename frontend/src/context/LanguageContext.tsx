import { createContext, useContext, useState, useEffect } from 'react';
import al from '../i18n/al';
import en from '../i18n/en';
import de from '../i18n/de';
import fr from '../i18n/fr';
import { normalizeName } from '../utils/labels';

type Lang = 'al' | 'en' | 'de' | 'fr';

const dicts: Record<Lang, any> = { al, en, de, fr };

/**
 * Indeks i fjalorit `markets` me çelës të normalizuar (i vogël, pa pikë në fund).
 * Emrat e tregjeve vijnë nga feed-i me shkronja të ndryshme
 * ("Corners. Total" / "Corners. total. ") — pa normalizim, përkthimi humbiste.
 */
const marketIndex: Record<string, Record<string, string>> = (() => {
  const out: Record<string, Record<string, string>> = {};
  for (const [code, dict] of Object.entries(dicts)) {
    const map: Record<string, string> = {};
    for (const [key, val] of Object.entries((dict as any)?.markets || {})) {
      if (typeof val === 'string') map[normalizeName(key).toLowerCase()] = val;
    }
    out[code] = map;
  }
  return out;
})();

interface LanguageContextType {
  lang: Lang;
  setLanguage: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
  /** Përkthim i drejtpërdrejtë i një emri tregu (emrat kanë pikë: "1st half. Result" —
   *  `t()` i ndan çelësat me pikë, prandaj këta kërkohen veçmas). */
  tm: (name: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('lang') as Lang | null;
    return saved && dicts[saved] ? saved : 'al';
  });

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = (key: string, fallback?: string) => {
    const keys = key.split('.');
    let val: any = dicts[lang];
    for (const k of keys) {
      if (!val) break;
      val = val[k];
    }
    if (val && typeof val === 'string') return val;

    // Fallback to Albanian if key missing in selected language
    let fb: any = dicts.al;
    for (const k of keys) {
      if (!fb) break;
      fb = fb[k];
    }
    if (fb && typeof fb === 'string') return fb;

    // Ne fund: fallback-i i dhene nga therritesi (p.sh. emri origjinal i tregut nga feed-i),
    // qe te mos shfaqen kurre çelesa te papërkthyer si "markets.xyz".
    return fallback && typeof fallback === 'string' ? fallback : key;
  };

  /**
   * Përkthimi i emrave të tregjeve. Këta emra PËRMBAJNË PIKË ("1st half. Result"),
   * ndërsa `t()` i ndan çelësat me pikë — prandaj këtu kërkohet në indeksin e
   * normalizuar të fjalorit `markets`, pa ndarje. Kthen '' nëse nuk ka përkthim.
   */
  const tm = (name: string): string => {
    const key = normalizeName(name).toLowerCase();
    if (!key) return '';
    return marketIndex[lang]?.[key] || marketIndex.al?.[key] || '';
  };

  return (
    <LanguageContext.Provider value={{ lang, setLanguage: setLang, t, tm }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);