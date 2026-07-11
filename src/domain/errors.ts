/** Base class so API routes can distinguish domain errors from bugs. */
export class DomainError extends Error {
  constructor(
    message: string,
    /** Stable machine-readable code, emitted in API error bodies. */
    readonly code: string,
  ) {
    super(message);
  }
}

/** Free tier allows one commissioned league per season (spec: monetization gates). */
export class FreeLeagueLimitError extends DomainError {
  constructor() {
    super(
      "Free tier includes one league per season. Upgrade to Premium to run more.",
      "PREMIUM_REQUIRED",
    );
  }
}

export class InvalidInviteError extends DomainError {
  constructor() {
    super("That invite code doesn't match any league.", "INVALID_INVITE");
  }
}

export class LeagueFullError extends DomainError {
  constructor(max: number) {
    super(
      `This league is full (${max} entries). The commissioner can upgrade to Premium for more.`,
      "LEAGUE_FULL",
    );
  }
}
