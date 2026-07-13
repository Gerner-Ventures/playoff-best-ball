/**
 * The monetization-learning event set for the beta season. Deliberately small:
 * funnel = create/join → draft → upgrade; plus the dues-collection fake door.
 * Pageviews come free from posthog-js autocapture.
 */
export const ANALYTICS_EVENTS = {
  LEAGUE_CREATED: "league_created",
  LEAGUE_JOINED: "league_joined",
  DRAFT_COMPLETED: "draft_completed",
  UPGRADE_CHECKOUT_STARTED: "upgrade_checkout_started",
  LEAGUE_UPGRADED: "league_upgraded",
  DUES_INTEREST: "dues_interest",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
