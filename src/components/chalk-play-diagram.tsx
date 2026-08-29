/**
 * A chalk-talk route diagram: receivers as circles, defenders as crosses, routes
 * as dashed chalk. Decorative only — hidden from assistive tech.
 */
export function ChalkPlayDiagram({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 560 470"
      className={`chalk w-full max-w-[34rem] ${className ?? ""}`}
    >
      <path d="M 40 300 L 520 288" stroke="var(--chalk)" strokeWidth="4" fill="none" opacity=".6" />
      <g stroke="var(--chalk-sky)" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="14 12">
        <path d="M 96 296 C 96 220, 150 196, 152 118" />
        <path d="M 470 292 C 470 232, 404 214, 402 150" />
      </g>
      <path
        d="M 232 298 C 232 250, 300 244, 316 200 L 372 176"
        stroke="var(--chalk-yellow)" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="14 12"
      />
      <path
        d="M 356 294 C 356 262, 300 254, 246 236"
        stroke="var(--chalk-lilac)" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="14 12"
      />
      <g stroke="var(--chalk-mint)" strokeWidth="5" fill="none">
        <circle cx="96" cy="300" r="17" />
        <circle cx="232" cy="302" r="17" />
        <circle cx="356" cy="298" r="17" />
        <circle cx="470" cy="296" r="17" />
      </g>
      <g stroke="var(--chalk-coral)" strokeWidth="5" strokeLinecap="round">
        <path d="M 168 372 l 26 26 M 194 372 l -26 26" />
        <path d="M 300 378 l 26 26 M 326 378 l -26 26" />
        <path d="M 424 370 l 26 26 M 450 370 l -26 26" />
      </g>
      <ellipse
        cx="286" cy="60" rx="46" ry="28"
        stroke="var(--chalk)" strokeWidth="5" fill="none" transform="rotate(-14 286 60)"
      />
      <path
        d="M 258 56 L 314 50 M 276 44 l 4 12 M 290 42 l 4 12"
        stroke="var(--chalk)" strokeWidth="4" strokeLinecap="round" fill="none"
      />
    </svg>
  );
}
