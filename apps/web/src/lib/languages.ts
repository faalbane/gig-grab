// Languages we promise on the marketing surface.
// Aligned with Deepgram Nova-3 `multi` (10 code-switching languages) plus
// what Cartesia Sonic-3 and ElevenLabs v3 cover for single-language sessions.
//
// `codeSwitching` flag = true means mid-call language mixing is supported
// (Spanglish, Hinglish etc). For everything else the language is locked
// at session start.

export type LanguageEntry = {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  codeSwitching: boolean;
};

export const LANGUAGES: LanguageEntry[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧", codeSwitching: true },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸", codeSwitching: true },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷", codeSwitching: true },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪", codeSwitching: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", codeSwitching: true },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹", codeSwitching: true },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹", codeSwitching: true },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱", codeSwitching: true },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵", codeSwitching: true },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺", codeSwitching: true },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱", codeSwitching: false },
  { code: "ro", name: "Romanian", nativeName: "Română", flag: "🇷🇴", codeSwitching: false },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "🇺🇦", codeSwitching: false },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦", codeSwitching: false },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷", codeSwitching: false },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog", flag: "🇵🇭", codeSwitching: false },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳", codeSwitching: false },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷", codeSwitching: false },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳", codeSwitching: false },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", flag: "🇱🇰", codeSwitching: false },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳", codeSwitching: false },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇧🇩", codeSwitching: false },
  { code: "ur", name: "Urdu", nativeName: "اردو", flag: "🇵🇰", codeSwitching: false },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩", codeSwitching: false },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪", codeSwitching: false },
  { code: "da", name: "Danish", nativeName: "Dansk", flag: "🇩🇰", codeSwitching: false },
  { code: "no", name: "Norwegian", nativeName: "Norsk", flag: "🇳🇴", codeSwitching: false },
  { code: "fi", name: "Finnish", nativeName: "Suomi", flag: "🇫🇮", codeSwitching: false },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", flag: "🇬🇷", codeSwitching: false },
  { code: "cs", name: "Czech", nativeName: "Čeština", flag: "🇨🇿", codeSwitching: false },
  { code: "bg", name: "Bulgarian", nativeName: "Български", flag: "🇧🇬", codeSwitching: false },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski", flag: "🇭🇷", codeSwitching: false },
];

export const LANGUAGE_COUNT = LANGUAGES.length;

export function findLanguage(code: string): LanguageEntry | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
