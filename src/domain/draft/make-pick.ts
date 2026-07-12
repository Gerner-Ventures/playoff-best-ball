import type { PrismaClient } from "@prisma/client";
import {
  DraftNotActiveError,
  NoSlotForPositionError,
  NotYourTurnError,
  PlayerUnavailableError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";
import { applyPickAndAdvance } from "./advance";
import { assignSlot } from "./slot-assignment";
import { draftOrderSchema, entryIdForPick } from "./snake-order";

export interface MakePickInput {
  leagueId: string;
  userId: string;
  playerId: string;
}

export async function makePick(db: PrismaClient, input: MakePickInput) {
  const draft = await db.draft.findUnique({
    where: { leagueId: input.leagueId },
    include: { picks: true },
  });
  if (!draft || draft.status !== "ACTIVE") throw new DraftNotActiveError();

  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  const settings = parseLeagueSettings(league.settings);
  const order = draftOrderSchema.parse(draft.order);

  const onClockEntryId = entryIdForPick(order, draft.currentPickIndex);
  const onClockEntry = await db.entry.findUniqueOrThrow({
    where: { id: onClockEntryId },
    include: { membership: true },
  });
  if (onClockEntry.membership.userId !== input.userId) throw new NotYourTurnError();

  const player = await db.player.findUnique({ where: { id: input.playerId } });
  if (!player || player.season !== league.season) throw new PlayerUnavailableError();
  if (draft.picks.some((p) => p.playerId === player.id)) throw new PlayerUnavailableError();

  const filled = draft.picks
    .filter((p) => p.entryId === onClockEntryId)
    .map((p) => p.slotIndex);
  const slotIndex = assignSlot(settings.rosterSlots, filled, player.position);
  if (slotIndex === null) throw new NoSlotForPositionError(player.position);

  return applyPickAndAdvance(db, {
    draft, settings, order,
    entryId: onClockEntryId,
    playerId: player.id,
    slotIndex,
    autodrafted: false,
  });
}
