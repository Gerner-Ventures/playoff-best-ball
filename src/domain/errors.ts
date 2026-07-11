/** Base class so API routes can distinguish domain errors from bugs. */
export class DomainError extends Error {}

/** Free tier allows one commissioned league per season (spec: monetization gates). */
export class FreeLeagueLimitError extends DomainError {
  constructor() {
    super("Free tier includes one league per season. Upgrade to Premium to run more.");
  }
}

export class InvalidInviteError extends DomainError {
  constructor() {
    super("That invite code doesn't match any league.");
  }
}

export class LeagueFullError extends DomainError {
  constructor(max: number) {
    super(`This league is full (${max} entries). The commissioner can upgrade to Premium for more.`);
  }
}
