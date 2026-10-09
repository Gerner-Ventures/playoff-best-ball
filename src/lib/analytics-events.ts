/**
 * The monetization-learning event set for the beta season. Deliberately small:
 * funnel = create/join → draft → upgrade; the dues-collection fake door; and the marketing list (visit → subscribe → confirm).
 * Pageviews come free from posthog-js autocapture.
 */
export const ANALYTICS_EVENTS = {
  LEAGUE_CREATED: "league_created",
  LEAGUE_JOINED: "league_joined",
  DRAFT_STARTED: "draft_started",
  DRAFT_PICK_MADE: "draft_pick_made",
  DRAFT_COMPLETED: "draft_completed",
  ENTRY_ADDED: "entry_added",
  LEAGUE_SETTINGS_UPDATED: "league_settings_updated",
  NOTIFICATION_SETTINGS_UPDATED: "notification_settings_updated",
  MOCK_DRAFT_STARTED: "mock_draft_started",
  UPGRADE_CHECKOUT_STARTED: "upgrade_checkout_started",
  LEAGUE_UPGRADED: "league_upgraded",
  DUES_INTEREST: "dues_interest",
  MARKETING_CTA_CLICKED: "marketing_cta_clicked",
  SUBSCRIBE_SUBMITTED: "subscribe_submitted",
  SUBSCRIBE_CONFIRMED: "subscribe_confirmed",
  UNSUBSCRIBED: "unsubscribed",
  INVITE_PAGE_VIEWED: "invite_page_viewed",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
