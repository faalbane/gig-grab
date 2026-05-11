// Multi-coloured Google "G" used on Continue-with-Google buttons. Same
// asset as the design source: designs/login/Login.html line 306.
export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.2c0-.64-.05-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.61z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.34A9 9 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.82.95 4.04l3-2.34z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .95 4.96l3 2.34C4.66 5.17 6.65 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
