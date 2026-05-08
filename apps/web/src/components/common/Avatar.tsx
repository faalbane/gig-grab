"use client";

/**
 * Deterministic colorful avatar derived from a stable seed (Firebase UID,
 * candidate id, phone, whatever's stable). Falls back to a generated DiceBear
 * "shapes" SVG so users without a profile photo still get a unique look.
 *
 * Style "shapes" is abstract artwork — no faces, no demographic implications.
 * Free public API, no auth required: https://www.dicebear.com/styles/shapes/
 */

type Props = {
  seed: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
  alt?: string;
};

const STYLE = "shapes";

export function Avatar({ seed, photoUrl, size = 36, className, alt = "" }: Props) {
  const px = `${size}px`;
  const generated = `https://api.dicebear.com/9.x/${STYLE}/svg?seed=${encodeURIComponent(
    seed || "guest",
  )}&radius=50`;
  const src = photoUrl || generated;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-full bg-gray-100 object-cover ${className ?? ""}`}
      style={{ width: px, height: px }}
      referrerPolicy="no-referrer"
    />
  );
}
