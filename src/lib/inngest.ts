import { Inngest } from "inngest";

// Durable timers for draft pick clocks. Local dev: `npx inngest-cli@latest dev`
// (the SDK auto-connects to the dev server); without it, event sends fail and are
// logged loudly — drafting still works, but autodraft timers and notifications don't fire.
export const inngest = new Inngest({ id: "playoff-best-ball" });
