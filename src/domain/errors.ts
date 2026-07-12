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

export class NotCommissionerError extends DomainError {
  constructor() {
    super("Only the commissioner can do that.", "NOT_COMMISSIONER");
  }
}

export class TooFewEntriesError extends DomainError {
  constructor() {
    super("You need at least 2 teams before starting the draft.", "TOO_FEW_ENTRIES");
  }
}

export class DraftAlreadyStartedError extends DomainError {
  constructor() {
    super("The draft has already started.", "DRAFT_ALREADY_STARTED");
  }
}

export class DraftNotActiveError extends DomainError {
  constructor() {
    super("The draft isn't active.", "DRAFT_NOT_ACTIVE");
  }
}

export class NotYourTurnError extends DomainError {
  constructor() {
    super("It's not your pick.", "NOT_YOUR_TURN");
  }
}

export class PlayerUnavailableError extends DomainError {
  constructor() {
    super("That player isn't available.", "PLAYER_UNAVAILABLE");
  }
}

export class NoSlotForPositionError extends DomainError {
  constructor(position: string) {
    super(`You have no open roster slot for a ${position}.`, "NO_SLOT_FOR_POSITION");
  }
}

/** A concurrent pick advanced the draft first; the caller should refetch and retry. */
export class PickConflictError extends DomainError {
  constructor() {
    super("Someone else's pick landed first — refresh and try again.", "PICK_CONFLICT");
  }
}

export class InsufficientPlayerPoolError extends DomainError {
  constructor() {
    super(
      "The player pool can't fill every roster in this league. Contact support.",
      "INSUFFICIENT_PLAYER_POOL",
    );
  }
}

export class NotLeagueMemberError extends DomainError {
  constructor() {
    super("You're not a member of this league.", "NOT_LEAGUE_MEMBER");
  }
}

export class ScheduleInPastError extends DomainError {
  constructor() {
    super("Pick a start time in the future.", "SCHEDULE_IN_PAST");
  }
}
