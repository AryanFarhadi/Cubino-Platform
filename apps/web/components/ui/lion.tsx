export function LionLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      {/* Mane rays */}
      <g fill="#e8a040">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <ellipse
            key={deg}
            cx="32"
            cy="32"
            rx="4"
            ry="10"
            transform={`rotate(${deg} 32 32)`}
            opacity="0.85"
          />
        ))}
      </g>
      {/* Face */}
      <circle cx="32" cy="34" r="16" fill="#f0b132" />
      <circle cx="32" cy="34" r="14" fill="#e8a040" />
      {/* Ears */}
      <circle cx="22" cy="24" r="5" fill="#d4922a" />
      <circle cx="42" cy="24" r="5" fill="#d4922a" />
      <circle cx="22" cy="24" r="3" fill="#c4822a" />
      <circle cx="42" cy="24" r="3" fill="#c4822a" />
      {/* Eyes */}
      <circle cx="27" cy="33" r="2.5" fill="#1e1f22" />
      <circle cx="37" cy="33" r="2.5" fill="#1e1f22" />
      <circle cx="27.8" cy="32.2" r="0.8" fill="#fff" opacity="0.7" />
      <circle cx="37.8" cy="32.2" r="0.8" fill="#fff" opacity="0.7" />
      {/* Nose & mouth */}
      <ellipse cx="32" cy="38" rx="3" ry="2.5" fill="#1e1f22" />
      <path d="M32 40 Q28 43 26 41" stroke="#1e1f22" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M32 40 Q36 43 38 41" stroke="#1e1f22" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** @deprecated use LionLogo */
export const CubbyLogo = LionLogo;

export function LionLoader() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-den-honey/30 mane-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-t-den-gold border-r-transparent border-b-transparent border-l-transparent mane-spin" />
        <div className="lion-pulse">
          <LionLogo size={40} />
        </div>
      </div>
      <p className="text-sm font-medium text-den-muted">Awakening the pride...</p>
    </div>
  );
}

/** @deprecated use LionLoader */
export const HoneycombSpinner = LionLoader;
