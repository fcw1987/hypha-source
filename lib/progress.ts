import {
  closed,
  creditGame,
  creditTeams,
  playerEntries,
  raceFinish,
  people,
  eligibleAt,
} from "./scorebook.ts";
import { tournamentPoolDispositions, tournamentWithdrawnPlayers } from "./tournament.ts";
import type { Book, Game, Player, Session } from "./scorebook.ts";

export type Scope = "session" | "season";
type Activity =
  | "void"
  | "withdrawn"
  | "played"
  | "bye"
  | "another court"
  | "pending"
  | "unplayed"
  | "did not attend"
  | "no games played";
export interface Reading {
  total: number | null;
  earned: number | null;
  activity: Activity;
  corrected: boolean;
}
export interface Checkpoint {
  label: string;
  detail: string;
  state: "saved" | "partial" | "pending" | "unplayed" | "excluded" | "void";
  corrected: number;
  readings: Map<string, Reading>;
}
export interface Progress {
  steps: Checkpoint[];
  totals: Map<string, number>;
  hasScores: boolean;
  pending: number;
  baseline: Set<string>;
}

export function sessionPlayers(book: Book, session: Session) {
  return session.format === "fixed"
    ? (session.teams ?? [])
    : people(book, session);
}
export function roundCourts(games: Game[]) {
  const byRound = new Map<number, Map<string, number>>();
  for (const g of games) {
    let courts = byRound.get(g.round);
    if (!courts) {
      courts = new Map();
      byRound.set(g.round, courts);
    }
    for (const id of [...g.a, ...g.b]) courts.set(id, g.court);
  }
  return byRound;
}

export function progressSaveSummary(session: Session, dispositions = tournamentPoolDispositions(session)) {
  let voids = 0, excluded = 0;
  for (const status of dispositions.values()) {
    if (status === "void") voids++;
    else excluded++;
  }
  const saved = session.games.filter(g => g.score).length;
  return saved + " of " + (session.games.length - voids) + " games saved" +
    (voids ? " · " + voids + " void" : "") +
    (excluded ? " · " + excluded + " saved " + (excluded === 1 ? "final" : "finals") + " excluded from pool standings" : "");
}

export function sessionProgress(
  book: Book,
  session: Session,
  players: Player[],
): Progress {
  const ledger = playerEntries(sessionPlayers(book, session));
  const dispositions = tournamentPoolDispositions(session);
  const withdrawn = tournamentWithdrawnPlayers(session);
  const activeGames = dispositions.size ? session.games.filter(g => dispositions.get(g.id) !== "void") : session.games;
  const byRound = roundCourts(activeGames);
  const canceled = roundCourts(dispositions.size ? session.games.filter(g => dispositions.get(g.id) === "void") : []);
  const lastPlayed = new Map<string, number>();
  if (withdrawn.size) for (const game of activeGames) {
    if (!game.score) continue;
    for (const id of [...game.a, ...game.b]) if (withdrawn.has(id))
      lastPlayed.set(id, Math.max(lastPlayed.get(id) ?? 0, game.round));
  }
  const complete = closed(book, book.sessions.indexOf(session));
  let saved = 0,
    pending = 0;
  const arrived = new Set<string>();
  const steps = session.games.map((g, i): Checkpoint => {
    for (const id of eligibleAt(session, g.round)) arrived.add(id);
    const state = dispositions.get(g.id) ?? (g.score ? "saved" : complete ? "unplayed" : "pending");
    if (g.score) {
      if (session.format === "fixed") creditTeams(ledger, session, g);
      else creditGame(ledger, g);
      saved++;
    }
    if (state === "pending") pending++;
    const readings = new Map<string, Reading>();
    for (const p of players) {
      const id =
        session.format === "fixed"
          ? session.teams!.find((t) => t.id === p.id)!.pair[0]
          : p.id;
      const assignedCourt = byRound.get(g.round)?.get(id);
      const side = g.a.includes(id) ? 0 : g.b.includes(id) ? 1 : null;
      let activity: Activity;
      if (state === "void") activity = "void";
      else if (state === "unplayed") activity = "unplayed";
      else if (side === null && withdrawn.has(id) && g.round > (lastPlayed.get(id) ?? 0)) activity = "withdrawn";
      else if (assignedCourt === undefined && canceled.get(g.round)?.has(id)) activity = "void";
      else if (!eligibleAt(session, g.round).includes(id))
        activity = "did not attend";
      else if (assignedCourt === undefined) activity = "bye";
      else if (assignedCourt !== g.court) activity = "another court";
      else activity = g.score ? "played" : "pending";
      const measured = arrived.has(id) && activity !== "void" && activity !== "withdrawn";
      readings.set(p.id, {
        total: g.score && measured ? ledger.get(p.id)!.points : null,
        earned: g.score && measured ? side === null ? 0 : g.score[side] : null,
        activity,
        corrected: !!g.correctedFrom && side !== null,
      });
    }
    const detail = [
      session.courts > 1 ? "R" + g.round + " · Court " + g.court : "",
      g.score?.join("–"),
      state === "void" ? "Void after pool withdrawal" : state === "excluded" ? "Excluded from pool standings" : "",
      g.correctedFrom ? "Previously " + g.correctedFrom.join("–") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      label: "Game " + (i + 1),
      detail,
      state,
      corrected: g.correctedFrom ? 1 : 0,
      readings,
    };
  });
  return {
    steps,
    totals: new Map(players.map((p) => [p.id, ledger.get(p.id)!.points])),
    hasScores: saved > 0,
    pending,
    baseline: new Set(
      sessionPlayers(book, session)
        .filter(
          (p) =>
            session.format === "fixed" || eligibleAt(session, 1).includes(p.id),
        )
        .map((p) => p.id),
    ),
  };
}

export function seasonProgress(book: Book, players: Player[]): Progress {
  const ledger = playerEntries(book.players),
    attended = new Set<string>();
  const finish = raceFinish(book);
  let any = false,
    pending = 0;
  const rotating = book.sessions.filter((s) => s.format !== "fixed");
  const steps = rotating.map((s): Checkpoint => {
    const i = book.sessions.indexOf(s);
    const roster = new Set(s.roster);
    const dispositions = tournamentPoolDispositions(s);
    const actual = dispositions.size ? s.games.filter(g => dispositions.get(g.id) !== "void") : s.games;
    const withdrawn = tournamentWithdrawnPlayers(s);
    const canceled = new Set<string>();
    if (dispositions.size) for (const game of s.games)
      if (dispositions.get(game.id) === "void") for (const id of [...game.a, ...game.b]) canceled.add(id);
    const before = new Map(
      players.map((p) => [p.id, { ...ledger.get(p.id)! }]),
    );
    let saved = 0,
      corrected = 0;
    const revised = new Set<string>();
    for (const g of actual) {
      if (!g.score) continue;
      creditGame(ledger, g);
      saved++;
      if (g.correctedFrom) {
        corrected++;
        for (const id of [...g.a, ...g.b]) revised.add(id);
      }
    }
    any ||= saved > 0;
    for (const id of s.roster) attended.add(id);
    const complete = closed(book, i, finish);
    const state = s.games.length > 0 && !actual.length ? "void" : !saved
      ? complete
        ? "unplayed"
        : "pending"
      : saved === actual.length || complete
        ? "saved"
        : "partial";
    if (state === "pending" || state === "partial")
      pending += actual.length - saved;
    const readings = new Map<string, Reading>();
    for (const p of players) {
      const current = ledger.get(p.id)!,
        last = before.get(p.id)!;
      const played = current.played > last.played;
      const scheduled = actual.some(
        (g) => g.a.includes(p.id) || g.b.includes(p.id),
      );
      const awaiting =
        roster.has(p.id) &&
        !played &&
        !complete &&
        actual.some(
          (g) => !g.score && (g.a.includes(p.id) || g.b.includes(p.id)),
        );
      const activity: Activity = !roster.has(p.id)
        ? "did not attend"
        : played
          ? "played"
          : withdrawn.has(p.id) ? "withdrawn"
          : !scheduled && canceled.has(p.id) ? "void"
          : awaiting
            ? "pending"
            : !scheduled
              ? "bye"
              : "no games played";
      const known = saved > 0 && attended.has(p.id) && !awaiting && activity !== "void" && activity !== "withdrawn";
      readings.set(p.id, {
        total: known ? current.points : null,
        earned: known ? current.points - last.points : null,
        activity,
        corrected: revised.has(p.id),
      });
    }
    return {
      label: "Session " + (i + 1),
      detail: dispositions.size ? s.date + " · " + progressSaveSummary(s, dispositions) : s.date + " · " + saved + "/" + s.games.length + " saved",
      state,
      corrected,
      readings,
    };
  });
  return {
    steps,
    totals: new Map(players.map((p) => [p.id, ledger.get(p.id)!.points])),
    hasScores: any,
    pending,
    baseline: new Set(rotating[0]?.roster ?? []),
  };
}

export function plotCeiling(observed: number) {
  if (observed <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(observed / 4));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((n) => n * magnitude)
      .find((n) => n * 4 >= observed) ?? magnitude * 10;
  return Math.max(4, Math.ceil(step) * 4);
}

// Split at missing results. Never interpolate a missing game's score.
export function lineSegments(values: (number | null)[]) {
  const segments: { index: number; value: number }[][] = [];
  let open = false;
  for (const [index, value] of values.entries()) {
    if (value === null) {
      open = false;
      continue;
    }
    if (!open) {
      segments.push([]);
      open = true;
    }
    segments[segments.length - 1].push({ index, value });
  }
  return segments;
}
export function axisLabels(count: number, limit: number) {
  if (count <= limit - 1) return Array.from({ length: count + 1 }, (_, i) => i);
  return Array.from({ length: limit }, (_, i) =>
    Math.round((count * i) / (limit - 1)),
  );
}

export interface RacePoint {
  top: number;
  leaders: string[];
  margin: number | null;
}

// The reference leader always comes from the whole field, even when the viewer hides a line.
export function racePoints(data: Progress): (RacePoint | null)[] {
  const saved = new Map([...data.baseline].map((id) => [id, 0]));
  return data.steps.map((step) => {
    if (step.state === "pending" || step.state === "unplayed" || step.state === "void") return null;
    for (const [id, reading] of step.readings)
      if (reading.total !== null) saved.set(id, reading.total);
    if (!saved.size) return null;
    const ranked = [...saved].sort((a, b) => b[1] - a[1]);
    const top = ranked[0][1];
    return {
      top,
      leaders: ranked.filter(([, value]) => value === top).map(([id]) => id),
      margin: ranked.length > 1 ? top - ranked[1][1] : null,
    };
  });
}

export function chartValues(
  data: Progress,
  race: (RacePoint | null)[],
  id: string,
  scope: Scope,
) {
  return data.steps.map((step, i) => {
    const value = step.readings.get(id)?.total;
    if (value == null || !race[i]) return null;
    return scope === "season" ? race[i]!.top - value : value;
  });
}

// At most four lines share a plot. Keep ties readable without moving their data points.
export function spreadLabels(
  anchors: { id: string; y: number }[],
  top: number,
  bottom: number,
  spacing: number,
) {
  const labels = [...anchors].sort((a, b) => a.y - b.y);
  const gap = Math.min(
    spacing,
    (bottom - top) / Math.max(1, labels.length - 1),
  );
  const positions: number[] = [];
  labels.forEach((l, i) =>
    positions.push(Math.max(l.y, i ? positions[i - 1] + gap : top)),
  );
  for (let i = positions.length - 1; i >= 0; i--)
    positions[i] = Math.min(
      positions[i],
      i === positions.length - 1 ? bottom : positions[i + 1] - gap,
    );
  return new Map(labels.map((l, i) => [l.id, positions[i]]));
}
