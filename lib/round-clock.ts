import { insist, integer } from "./scorebook.ts";
import type { Session } from "./scorebook.ts";

// The server stores one start instant. Elapsed time does not mutate scores or draws.
export function startRoundClock(session: Session, round: unknown, requestedRevision: unknown, revision: number, now: number) {
  insist(session.club?.timed && !session.submitted, "Choose an open timed event.", 409);
  insist(integer(round, 1, Number.MAX_SAFE_INTEGER), "Choose an issued round or wave.");
  const number = round as number;
  if (session.roundClocks?.[number] !== undefined) return;
  insist(requestedRevision === revision, "The board changed. Refresh before starting the clock.", 409);
  const firstPending = session.games.find(game => !game.score);
  insist(firstPending?.round === number, "Start the clock for the current unfinished round or wave.", 409);
  session.roundClocks ??= {};
  session.roundClocks[number] = now;
}
