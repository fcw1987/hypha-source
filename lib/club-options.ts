import { insist, integer } from "./scorebook.ts";
import type { ClubBoxBlock } from "./club-box.ts";
import type { TournamentBracket, TournamentOptions } from "./tournament.ts";
export type { TournamentOptions } from "./tournament.ts";

export type ClubPlay = "split" | "fixed" | "singles";
export interface TimedPlay {
  minutes: number;
  tie: "deciding-point";
  cap?: number;
}
export interface ClubOptions {
  play: ClubPlay;
  draw: "ladder" | "round-robin" | "box" | "tournament";
  movement: "up-down" | "top-falls";
  rounds?: number;
  pools?: number;
  timed?: TimedPlay;
  tournament?: TournamentOptions;
}
export interface ClubState extends ClubOptions {
  queue: string[];
  poolByPlayer?: Record<string, number>;
  boxes?: ClubBoxBlock[];
  bracket?: TournamentBracket;
}

export const clubMaxPlayers = 48;
export const clubCourtLimit = (play: ClubPlay) => play === "singles" ? 24 : 12;

export function clubOptions(value: unknown): ClubOptions {
  insist(value && typeof value === "object", "Choose a play format.");
  const r = value as Partial<ClubOptions>;
  insist(r.play === "split" || r.play === "fixed" || r.play === "singles", "Choose how players compete.");
  insist(r.draw === "ladder" || r.draw === "round-robin" || r.draw === "box" || r.draw === "tournament", "Choose a supported draw.");
  const movement = r.movement ?? "up-down";
  insist(movement === "up-down" || movement === "top-falls", "Choose a court movement rule.");
  const box = r.draw === "box";
  insist(!box || r.play !== "split", "Box play supports singles and fixed teams.");
  const tournament = r.draw === "tournament";
  insist(tournament || r.tournament === undefined, "Tournament settings apply only to a tournament.");
  const pools = r.pools ?? (box ? 2 : 1);
  const maxPools = r.draw !== "ladder" && r.play !== "split" ? 4 : 1;
  insist(integer(pools, box ? 2 : 1, maxPools), box ? "Choose two to four flights." : "Choose a supported pool count.");
  insist(r.rounds === undefined || (r.draw === "round-robin" && integer(r.rounds, 1, r.play === "split" ? 24 : 47)), "Choose a supported number of pairing rounds.");
  const result: ClubOptions = { play: r.play, draw: r.draw, movement, pools };
  if (tournament) {
    const t = r.tournament;
    insist(r.play !== "split" && t && (t.entry === "pools" || t.entry === "seeded"),
      "Choose a singles or fixed-team tournament and how entrants qualify.");
    insist((t.qualifiers === 2 || t.qualifiers === 4) && typeof t.bronze === "boolean" &&
      (t.division === "open" || (r.play === "fixed" && t.division === "mixed")), "Review the tournament settings.");
    insist(t.entry === "seeded" ? pools === 1 : pools === 1 || (pools === 2 && t.qualifiers === 4),
      "Choose one pool, top two from each of two pools, or one seeded bracket.");
    result.tournament = { entry: t.entry, qualifiers: t.qualifiers, bronze: t.bronze, division: t.division };
  }
  if (r.rounds !== undefined) result.rounds = r.rounds;
  if (r.timed !== undefined) {
    const t = r.timed;
    insist(t && typeof t === "object" && integer(t.minutes, 1, 180), "Choose 1–180 minutes per timed game.");
    insist(t.tie === "deciding-point", "A tied timed game needs one deciding point.");
    insist(t.cap === undefined || integer(t.cap, 1, 999), "Choose a whole timed-game point cap from 1 to 999, or leave it off.");
    result.timed = { minutes: t.minutes, tie: t.tie, ...(t.cap === undefined ? {} : { cap: t.cap }) };
  }
  return result;
}
