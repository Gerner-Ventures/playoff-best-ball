import { FREE_TIER_MAX_ENTRIES, pickClockHoursSchema } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "general" | "pricing";
}

/**
 * Every answer must be true of the code today. Numbers and dates come from the
 * constants the rules use, so the FAQ cannot drift from the product.
 */
export function faqItems(): FaqItem[] {
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);
  const fieldSet = formatCalendarDay(SEASON_CALENDAR.fieldSet);
  const wildCard = formatCalendarDay(SEASON_CALENDAR.wildCardStart);
  const clockHours = pickClockHoursSchema.options.map((o) => o.value);
  const clockRangeText = `${Math.min(...clockHours)} to ${Math.max(...clockHours)} hours`;
  return [
    {
      id: "what",
      category: "general",
      question: "What is playoff best ball?",
      answer:
        "A fantasy league that covers only the NFL playoffs. You draft a nine-player roster once, before Wild Card weekend, and every player scores automatically each round his team is still alive. There are no lineups to set and no waivers. Most total points after the Super Bowl wins.",
    },
    {
      id: "when",
      category: "general",
      question: "When does the draft happen?",
      answer: `Between ${fieldSet}, when the playoff field is set, and Wild Card kickoff on ${wildCard}. The commissioner picks the start time. It's a slow draft, so nobody has to be online at the same time.`,
    },
    {
      id: "online",
      category: "general",
      question: "Do I have to be online for the draft?",
      answer: `No. Each pick has a clock of ${clockRangeText}, set by your commissioner, and you're notified by email (and by text or push if you turn them on) when you're up. If the clock runs out, autodraft picks for you: your top queued player if you've set a queue, otherwise the best available.`,
    },
    {
      id: "eliminated",
      category: "general",
      question: "What happens when a player's team is eliminated?",
      answer: "He stops scoring. That's the strategy: players on teams that go deep score in more rounds.",
    },
    {
      id: "bye",
      category: "general",
      question: "What about the top seeds' bye?",
      answer:
        "The top seed in each conference skips Wild Card weekend, so its players can play at most three games instead of four. A great player on a bye team starts a round behind.",
    },
    {
      id: "injuries",
      category: "general",
      question: "What if a player gets hurt?",
      answer:
        "If your commissioner turns on substitutions, an injured player's points up to the injury count, plus his substitute's points afterward. It's off by default.",
    },
    {
      id: "money",
      category: "general",
      question: "Do you handle buy-ins or prize money?",
      answer:
        "No. Money never touches Playoff Best Ball. Commissioners can record an entry fee, show their Venmo handle, and mark who has paid.",
    },
    {
      id: "practice",
      category: "general",
      question: "Can I practice drafting?",
      answer: "Yes. Sign in and run a mock draft against bots any time. Nothing in a mock counts.",
    },
    {
      id: "stop-email",
      category: "general",
      question: "How do I stop the weekly email?",
      answer: "Use the unsubscribe link in any email, or turn off the weekly digest in your notification settings.",
    },
    {
      id: "cost",
      category: "pricing",
      question: "How much does it cost?",
      answer: `Joining a league is always free. Running one is free for up to ${FREE_TIER_MAX_ENTRIES} teams. Premium is ${price} per league, per season, paid once by the commissioner, and raises the cap to ${PREMIUM_MAX_ENTRIES} teams.`,
    },
    {
      id: "per-league",
      category: "pricing",
      question: "Is Premium per league or per person?",
      answer: "Per league. One payment covers that league for the season, for every member.",
    },
    {
      id: "renew",
      category: "pricing",
      question: "Does it renew?",
      answer: "No. It's a one-time charge for the season. There's no subscription to cancel.",
    },
    {
      id: "mid-season",
      category: "pricing",
      question: "Can I upgrade mid-season?",
      answer:
        "Yes, and Premium switches on straight away. Scoring changes apply to weeks already played, since points are worked out when standings are read, so check with your league before rewriting the rules in January.",
    },
    {
      id: "free-league",
      category: "pricing",
      question: "What happens to a free league?",
      answer: `Nothing changes. It keeps running with preset scoring and up to ${FREE_TIER_MAX_ENTRIES} teams.`,
    },
  ];
}
