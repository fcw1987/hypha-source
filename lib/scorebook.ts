import type { ClubState } from "./club-options.ts";
import { guardTournamentScore, tournamentGameStatus, tournamentPhase } from "./tournament.ts";
import type { PracticeEntry } from "./practice.ts";

export interface Rules {
  gameTo: number;
  rounds: number;
  target: number | null;
  ceiling?: number;
  finish: "cap" | "two";
  tie: "share" | "lead";
}
export interface Player {
  id: string;
  name: string;
}
export type Score = [number, number];
export type Pair = [string, string];
export type Side = [string] | Pair;
export interface Game {
  id: string;
  round: number;
  court: number;
  a: Side;
  b: Side;
  score: Score | null;
  started?: boolean;
  live?: Score;
  editVersion?: number;
  correctedFrom?: Score;
}
export interface FixedTeam extends Player {
  pair: Pair;
}
export interface Session {
  id: string;
  date: string;
  roster: string[];
  courts: number;
  submitted: boolean;
  games: Game[];
  format?: "fixed" | "singles";
  club?: ClubState;
  roundClocks?: Record<number, number>;
  teams?: FixedTeam[];
  guests?: Player[];
  active?: string[];
  attendanceByRound?: Record<string, string[]>;
  drawVersion?: number;
  paused?: boolean;
  resumeRound?: number;
}
export interface Book {
  kind?: "practice";
  id: string;
  name: string;
  rules: Rules;
  players: Player[];
  sessions: Session[];
  practice?: PracticeEntry[];
  ended?: true;
}
export function formatLabel(session: Session) {
  if (session.club) {
    const { play, draw } = session.club;
    const label = play === "singles" ? "Singles" : play === "fixed" ? "Fixed teams" : "Rotating partners";
    return label + (draw === "tournament" ? " · Tournament" : draw === "ladder" ? " · Court ladder" : draw === "box" ? " · Box ladder" : play === "split" ? " · Mixer" : " · Round robin");
  }
  if (session.format === "singles") return "Singles";
  return session.format === "fixed" ? "Fixed teams" : "Rotating partners";
}
export function isSingles(book: Book) {
  return book.sessions[0]?.format === "singles";
}
export interface Entry {
  id: string;
  name: string;
  points: number;
  played: number;
  wins: number;
}
export interface Finish {
  ids: string[];
  session: number;
  round: number;
}
export interface Change {
  id: string;
  score: Score;
  before: Score | null;
  beforeVersion?: number;
}
export const exampleId = "example-season";
export const maxPlayers = 16;
export function courtCapacity(count: number) {
  return Math.min(4, Math.floor(count / 4));
}
export function quickScores(target: number) {
  const first = Math.max(0, target - 5);
  return Array.from({ length: target - first + 1 }, (_, i) => first + i);
}
export function finishExample(r: Rules): string {
  if (!Number.isInteger(r.gameTo) || r.gameTo < 1 || r.gameTo > 50)
    return "Choose the winning score for this game.";
  const tied = r.gameTo - 1;
  if (r.finish === "cap")
    return (
      "At " +
      tied +
      "–" +
      tied +
      ", the next point wins. " +
      r.gameTo +
      "–" +
      tied +
      " is a valid final score."
    );
  return (
    "At " +
    tied +
    "–" +
    tied +
    ", play to a two-point lead, for example " +
    (r.gameTo + 1) +
    "–" +
    tied +
    (r.ceiling
      ? ". At " +
        (r.ceiling - 1) +
        "–" +
        (r.ceiling - 1) +
        ", the next point wins."
      : ". There is no hard cap.")
  );
}
export const defaults: Rules = {
  gameTo: 11,
  rounds: 9,
  target: 891,
  finish: "cap",
  tie: "share",
};
export class BookError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function insist(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new BookError(message, status);
}
export function integer(n: unknown, min: number, max: number) {
  return Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
}
export function cleanName(value: unknown, max: number, label: string): string {
  insist(typeof value === "string", "Enter a " + label + ".");
  const name = value.normalize("NFC").trim();
  insist(
    name.length > 0 &&
      name.length <= max &&
      !/[\u0000-\u001f\u007f]/u.test(name),
    "Use 1–" + max + " characters for each " + label + ".",
  );
  return name;
}
export function checkRules(r: Rules) {
  insist(
    r &&
      integer(r.gameTo, 1, 50) &&
      (r.target === null || integer(r.target, 1, 99999)) &&
      integer(r.rounds, 1, 24),
    "Choose 1–50 game points, 1–24 rounds, and an optional season target from 1–99,999.",
  );
  insist(
    ["cap", "two"].includes(r.finish) && ["share", "lead"].includes(r.tie),
    "Choose a supported finish and tie rule.",
  );
  insist(
    r.ceiling === undefined ||
      (r.finish === "two" && integer(r.ceiling, r.gameTo + 1, 999)),
    "Choose a hard cap above the game winning score, up to 999.",
  );
  return {
    ...(r.ceiling === undefined ? {} : { ceiling: r.ceiling }),
    gameTo: r.gameTo,
    rounds: r.rounds,
    target: r.target,
    finish: r.finish,
    tie: r.tie,
  };
}
export function checkDate(date: unknown): asserts date is string {
  insist(
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
    "Enter a valid session date.",
  );
  const d = new Date(date + "T12:00:00Z");
  insist(
    Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date,
    "Enter a valid session date.",
  );
}
export function gameRuleLabel(rules: Rules, session?: Session): string {
  const timed = session?.club?.timed;
  if (timed) return timed.minutes + " min · " + (timed.cap === undefined ? "No point cap" : "Cap " + timed.cap);
  return "To " + rules.gameTo + (rules.finish === "cap" ? " · Hard cap" : " · Win by two" +
    (rules.ceiling === undefined ? "" : " · Cap " + rules.ceiling));
}

export function scoreProblem(score: unknown, rules: Rules, session?: Session): string | null {
  if (
    !Array.isArray(score) ||
    score.length !== 2 ||
    !score.every((n) => integer(n, 0, 999))
  )
    return "Enter two whole scores between 0 and 999.";
  const high = Math.max(...score),
    low = Math.min(...score);
  const timed = session?.club?.timed;
  if (timed) {
    if (timed.cap !== undefined && high > timed.cap) return "The timed-game point cap is " + timed.cap + ".";
    return high === low ? "Play one deciding point after a tied whistle, then enter the winning score." : null;
  }
  if (high === low) return "A finished game needs a winner.";
  if (rules.finish === "cap")
    return high === rules.gameTo
      ? null
      : "The winner must finish on " + rules.gameTo + ".";
  if (rules.ceiling !== undefined) {
    if (high > rules.ceiling) return "The hard cap is " + rules.ceiling + ".";
    if (high === rules.ceiling && high - low === 1) return null;
  }
  return (high === rules.gameTo && high - low >= 2) ||
    (high > rules.gameTo && high - low === 2)
    ? null
    : "Play to " + rules.gameTo + " and win by two.";
}
export function people(book: Book, session: Session): Player[] {
  const found = new Map(
    [...book.players, ...(session.guests ?? [])].map((p) => [p.id, p]),
  );
  return session.roster.map((id) => found.get(id)!).filter(Boolean);
}
export function eligibleAt(session: Session, round: number): string[] {
  return session.attendanceByRound?.[round] ?? session.roster;
}
export function teamFor(s: Session, pair: Side) {
  if (pair.length !== 2) return undefined;
  return s.teams?.find(
    (t) => t.pair.includes(pair[0]) && t.pair.includes(pair[1]),
  );
}
export function pairLabel(s: Session, pair: Side, names: Map<string, string>) {
  const team = teamFor(s, pair);
  return team
    ? team.name
    : pair.map((id) => names.get(id) ?? "Player").join(" & ");
}
export function creditTeams(entries: Map<string, Entry>, s: Session, g: Game) {
  if (!g.score) return;
  for (const [i, pair] of [g.a, g.b].entries()) {
    const team = teamFor(s, pair);
    const entry = team && entries.get(team.id);
    if (!entry) continue;
    entry.points += g.score[i];
    entry.played++;
    entry.wins += Number(g.score[i] > g.score[1 - i]);
  }
}
export function creditGame(entries: Map<string, Entry>, game: Game) {
  if (!game.score) return;
  for (const [side, team] of [game.a, game.b].entries()) {
    for (const player of team) {
      const row = entries.get(player);
      if (!row) continue;
      row.points += game.score[side];
      row.played += 1;
      if (game.score[side] > game.score[1 - side]) row.wins += 1;
    }
  }
}
export function playerEntries(players: Player[]) {
  return new Map(
    players.map((p) => [p.id, { ...p, points: 0, played: 0, wins: 0 }]),
  );
}
export function standings(book: Book, session?: Session): Entry[] {
  const entries = playerEntries(
    session
      ? session.format === "fixed"
        ? (session.teams ?? [])
        : people(book, session)
      : book.players,
  );
  for (const s of session ? [session] : book.sessions) {
    if (!session && s.format === "fixed") continue;
    for (const g of s.games) {
      if (s.format === "fixed") creditTeams(entries, s, g);
      else creditGame(entries, g);
    }
  }
  return [...entries.values()].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name),
  );
}
// A result entered out of order cannot establish who arrived first.
export function raceFinish(book: Book): Finish | null {
  const target = book.rules.target;
  if (target === null) return null;
  const entries = playerEntries(book.players);
  for (const [index, session] of book.sessions.entries()) {
    if (session.format === "fixed") continue;
    for (const round of new Set(session.games.map((g) => g.round))) {
      const games = session.games.filter((g) => g.round === round);
      if (games.some((g) => !g.score)) return null;
      for (const g of games) creditGame(entries, g);
      const crossing = [...entries.values()].filter(
        (row) => row.points >= target,
      );
      if (!crossing.length) continue;
      const top = Math.max(...crossing.map((p) => p.points));
      const winners =
        book.rules.tie === "share"
          ? crossing
          : crossing.filter((p) => p.points === top);
      if (book.rules.tie === "share" || winners.length === 1)
        return {
          ids: winners.map((p) => p.id),
          session: index,
          round: games[0].round,
        };
    }
  }
  return null;
}
function requiredGamesScored(session: Session) {
  return session.games.every(game => game.score || tournamentGameStatus(session, game) === "void");
}
export function closed(
  book: Book,
  index: number,
  finish = raceFinish(book),
): boolean {
  const s = book.sessions[index];
  return (
    s.submitted &&
    ((!s.paused && requiredGamesScored(s)) ||
      (s.format !== "fixed" && !!finish && finish.session <= index))
  );
}
export function sameScore(a: Score | null, b: Score | null) {
  return a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
}
export function record(
  book: Book,
  id: string,
  changes: Change[],
  submit: boolean,
) {
  const index = book.sessions.findIndex((s) => s.id === id);
  insist(index >= 0, "Session unavailable.", 404);
  const session = book.sessions[index];
  insist(
    Array.isArray(changes) &&
      changes.length <= session.games.length &&
      (submit || changes.length > 0),
    "Choose scores to save.",
  );
  const seen = new Set<string>();
  const updates = changes.map((change) => {
    insist(
      change && typeof change.id === "string" && !seen.has(change.id),
      "Each game may be included once.",
    );
    seen.add(change.id);
    const game = session.games.find((g) => g.id === change.id);
    insist(game, "Game unavailable.", 404);
    const problem = scoreProblem(change.score, book.rules, session);
    insist(!problem, problem ?? "Invalid score.");
    insist(
      change.before === null || !scoreProblem(change.before, book.rules, session),
      "Reload the saved score before editing.",
    );
    insist(
      sameScore(game.score, change.before) ||
        sameScore(game.score, change.score),
      "Another device changed this game. Review the saved score before replacing it.",
      409,
    );
    const revision = game.editVersion ?? 0;
    insist(
      change.beforeVersion === undefined ||
        integer(change.beforeVersion, 0, Number.MAX_SAFE_INTEGER),
      "Reload this game before editing.",
    );
    const matchesRevision = (change.beforeVersion ?? 0) === revision;
    insist(
      matchesRevision || sameScore(game.score, change.score),
      "This game changed after your draft. Refresh and review it.",
      409,
    );
    guardTournamentScore(session, game, change.score);
    return {
      game,
      score: change.score,
      versioned: change.beforeVersion !== undefined || revision > 0,
    };
  });
  // Callers mutate a freshly loaded document and commit only on success.
  for (const { game } of updates) {
    if (game.score) continue;
    const index = session.games.indexOf(game),
      ids = [...game.a, ...game.b];
    const conflict = session.games
      .slice(0, index)
      .some(
        (g) =>
          g.started &&
          !g.score &&
          tournamentGameStatus(session, g) !== "void" &&
          !seen.has(g.id) &&
          (g.court === game.court ||
            [...g.a, ...g.b].some((p) => ids.includes(p))),
      );
    insist(
      !conflict,
      "Players or the court are still in an earlier game.",
      409,
    );
  }
  for (const { game, score, versioned } of updates) {
    if (versioned && !sameScore(game.score, score))
      game.editVersion = (game.editVersion ?? 0) + 1;
    if (game.score && !sameScore(game.score, score))
      game.correctedFrom = [...game.score];
    delete game.started;
    delete game.live;
    game.score = [...score];
  }
  if (submit) {
    insist(session.club?.draw !== "tournament" || tournamentPhase(session) === "complete",
      "Finish the playoff final and any bronze game before submitting the tournament.", 409);
    const finish = raceFinish(book);
    insist(
      (!session.paused && requiredGamesScored(session)) ||
        (session.format !== "fixed" && finish && finish.session <= index),
      "Enter every game before submitting, or finish the race in a fully scored round.",
    );
    session.submitted = true;
  }
  return book;
}
