/** One list email. The sender turns oneClickUnsubscribeUrl into the List-Unsubscribe headers. */
export interface MarketingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** RFC 8058 one-click endpoint (POST), not the human-facing unsubscribe page. */
  oneClickUnsubscribeUrl: string;
}

export interface MarketingSender {
  send(email: MarketingEmail): Promise<void>;
}

/** Absolute links for one deployment; injected so domain code never reads env. */
export interface SubscriberUrls {
  confirm(token: string): string;
  unsubscribePage(token: string): string;
  oneClickUnsubscribe(token: string): string;
}
