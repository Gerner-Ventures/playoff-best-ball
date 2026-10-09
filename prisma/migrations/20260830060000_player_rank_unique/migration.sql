-- Enforce what the code already assumes: one player per (season, defaultRank).
-- autodraft orders by `defaultRank asc` with no tiebreak, so a tie makes the draft
-- board depend on undefined ordering — and that is exactly how a dev-fixture player
-- came to sit at rank 7 alongside a real one, draftable in round 1 with no stat line.
--
-- Every writer already produces unique ranks: syncPlayerPool assigns nextRank++ from
-- max+1, the dev fixture is validated for uniqueness before it is loaded, and
-- applyDefaultRanks shifts every row of the season clear before reassigning. This
-- index makes a regression in any of them fail at the write instead of silently
-- reordering somebody's draft.
--
-- No down-migration: dropping an index is a one-liner and reversing it means
-- reintroducing the ambiguity.

-- Fail with something actionable rather than a bare 23505 from the index build.
-- CREATE UNIQUE INDEX would refuse anyway; this says how many and where.
DO $$
DECLARE
  dupes bigint;
  sample text;
BEGIN
  SELECT count(*), coalesce(string_agg(format('season %s rank %s (x%s)', season, "defaultRank", n), ', '), '')
    INTO dupes, sample
  FROM (
    SELECT season, "defaultRank", count(*) AS n
    FROM "Player" GROUP BY season, "defaultRank" HAVING count(*) > 1
    ORDER BY season, "defaultRank" LIMIT 5
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce unique (season, defaultRank): % colliding rank(s) exist [%]. Renumber them before deploying — see applyDefaultRanks in src/domain/demo/seed-demo.ts for the shift-then-assign pattern.',
      dupes, sample;
  END IF;
END $$;

CREATE UNIQUE INDEX "Player_season_defaultRank_key" ON "Player"("season", "defaultRank");

-- Replaced by the unique index above, which serves the same lookups.
DROP INDEX IF EXISTS "Player_season_defaultRank_idx";
