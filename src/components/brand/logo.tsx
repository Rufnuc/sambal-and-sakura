import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={cn("size-9", className)}
      role="img"
      aria-label="Sambal and Sakura"
    >
      <defs>
        <linearGradient id="ssGold" x1="18" y1="18" x2="110" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F0C65A" />
          <stop offset="0.55" stopColor="#E0A83E" />
          <stop offset="1" stopColor="#C98A24" />
        </linearGradient>
        <linearGradient id="ssPetal" x1="64" y1="40" x2="64" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F4C9D2" />
          <stop offset="1" stopColor="#E2869A" />
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r="60" fill="#211D17" />
      <path d="M96 30 A46 46 0 1 0 103 74" stroke="url(#ssGold)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <g transform="translate(64 66)">
        <g fill="url(#ssPetal)">
          <path d="M0 -26 C7 -20 7 -9 0 -4 C-7 -9 -7 -20 0 -26 Z" />
          <path d="M0 -26 C7 -20 7 -9 0 -4 C-7 -9 -7 -20 0 -26 Z" transform="rotate(72)" />
          <path d="M0 -26 C7 -20 7 -9 0 -4 C-7 -9 -7 -20 0 -26 Z" transform="rotate(144)" />
          <path d="M0 -26 C7 -20 7 -9 0 -4 C-7 -9 -7 -20 0 -26 Z" transform="rotate(216)" />
          <path d="M0 -26 C7 -20 7 -9 0 -4 C-7 -9 -7 -20 0 -26 Z" transform="rotate(288)" />
        </g>
        <circle r="6.5" fill="#E0A83E" />
        <circle r="2.6" fill="#C0362C" />
      </g>
    </svg>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-10" />
      {!compact && (
        <span translate="no" className="notranslate font-display text-2xl font-extrabold leading-none tracking-tight sm:text-[1.65rem]">
          Sambal <span className="text-gold">&amp;</span> Sakura
        </span>
      )}
    </span>
  );
}
