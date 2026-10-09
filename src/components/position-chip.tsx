/**
 * Position marker.
 *
 * The letters are the signal; the colour is redundant reinforcement. That
 * redundancy is the only reason six hues are defensible on one screen — a
 * colourblind user loses nothing, because they were never reading the hue.
 * Never render this without its label.
 *
 * An unrecognised value falls back to the neutral chip rather than throwing.
 * A draft board should not blank out because a position string surprised us.
 */
export function PositionChip({
  position,
  className,
}: {
  position: string;
  className?: string;
}) {
  return (
    <span data-pos={position} className={className ? `pos-chip ${className}` : "pos-chip"}>
      {position}
    </span>
  );
}
