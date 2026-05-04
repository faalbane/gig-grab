import { LANGUAGES, LANGUAGE_COUNT } from "@/lib/languages";

type Props = { visibleCount?: number };

export function LanguagesStrip({ visibleCount = 8 }: Props) {
  const visible = LANGUAGES.slice(0, visibleCount);
  const overflow = LANGUAGE_COUNT - visibleCount;
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
      <span className="text-gray-500">🌍 Speak any language</span>
      <span className="flex items-center gap-1">
        {visible.map((l) => (
          <span key={l.code} title={l.name} className="text-base leading-none">
            {l.flag}
          </span>
        ))}
        {overflow > 0 && (
          <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            +{overflow}
          </span>
        )}
      </span>
    </div>
  );
}
