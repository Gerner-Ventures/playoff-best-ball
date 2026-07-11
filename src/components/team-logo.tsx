"use client";

import Image from "next/image";
import { useState } from "react";

interface TeamLogoProps {
  abbreviation: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_MAP = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

/**
 * Team logo component that fetches from ESPN's CDN
 * Falls back to showing the team abbreviation if the image fails to load
 */
export function TeamLogo({ abbreviation, size = "md", className = "" }: TeamLogoProps) {
  const [hasError, setHasError] = useState(false);
  const pixelSize = SIZE_MAP[size];

  // ESPN uses lowercase abbreviations for logo URLs
  const logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png`;

  if (hasError) {
    // Fallback to abbreviation text
    return (
      <div
        className={`flex items-center justify-center bg-[rgba(255,255,255,0.1)] rounded-full font-bold text-[var(--chalk-muted)] ${className}`}
        style={{ width: pixelSize, height: pixelSize, fontSize: pixelSize * 0.35 }}
      >
        {abbreviation}
      </div>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt={`${abbreviation} logo`}
      width={pixelSize}
      height={pixelSize}
      className={`object-contain ${className}`}
      onError={() => setHasError(true)}
      unoptimized // ESPN CDN images don't need Next.js optimization
    />
  );
}

/**
 * Team logo with name displayed next to it
 */
export function TeamLogoWithName({
  abbreviation,
  displayName,
  size = "md",
  className = "",
  nameClassName = "",
}: TeamLogoProps & { displayName: string; nameClassName?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TeamLogo abbreviation={abbreviation} size={size} />
      <span className={nameClassName}>{displayName}</span>
    </div>
  );
}
