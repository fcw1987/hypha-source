import {
  cleanName,
  closed,
  courtCapacity,
  eligibleAt,
  insist,
  maxPlayers,
  people,
  standings,
} from "./scorebook.ts";
import type { Book, Game, Session } from "./scorebook.ts";
import { resolvePlayers, schedule } from "./rotation.ts";
import { tournamentGameStatus, tournamentPoolDispositions, tournamentWithdrawnPlayers } from "./tournament.ts";
import { fixedDraw, fixedTeamsPlaying } from "./fixed-teams.ts";
export const onCourt = (g: Game) => [...g.a, ...g.b];
export function findSession(book: Book, id: unknown) {
  const session = book.sessions.find((s) => s.id === id);
  insist(session, "Session unavailable.", 404);
  return session;
}
export function waitingFor(s: Session, g: Game) {
  if (g.score || g.started || tournamentGameStatus(s, g) === "void") return [];
  const players = onCourt(g),
    at = s.games.indexOf(g);
  return s.games.filter(
    (other, index) =>
      other !== g &&
      !other.score &&
      (other.started || index < at) &&
      (other.court === g.court ||
        onCourt(other).some((p) => players.includes(p))) &&
      tournamentGameStatus(s, other) !== "void",
  );
}
export function courtBoard(s: Session) {
  const dispositions = tournamentPoolDispositions(s);
  return Array.from({ length: s.courts }, (_, i) => {
    const court = i + 1,
      pending = s.games.filter((g) => g.court === court && !g.score && dispositions.get(g.id) !== "void");
    const current = pending.find((g) => g.started) ?? pending[0];
    const next = pending.find((g) => g !== current);
    return {
      court,
      current,
      next,
      waiting: current ? waitingFor(s, current) : [],
    };
  });
}
export function startGame(book: Book, s: Session, id: unknown) {
  insist(
    !closed(book, book.sessions.indexOf(s)),
    "This session is submitted.",
    409,
  );
  const game = s.games.find((g) => g.id === id);
  insist(
    game && !game.score,
    "This game is no longer available to start.",
    409,
  );
  insist(tournamentGameStatus(s, game) !== "void", "This pool game is void after a withdrawal.", 409);
  if (game.started) return;
  insist(
    !waitingFor(s, game).length,
    "Waiting for a court or players from an earlier game.",
    409,
  );
  game.started = true;
}
export function byes(s: Session, round: number) {
  const assigned = new Set(
    s.games.filter((g) => g.round === round).flatMap(onCourt),
  );
  const withdrawn = tournamentWithdrawnPlayers(s);
  return eligibleAt(s, round).filter((id) => !assigned.has(id) && !withdrawn.has(id));
}
export interface AttendanceChange {
  names: string[];
  guestNames?: string[];
}
export function reassign(book: Book, s: Session, input: AttendanceChange) {
  insist(!s.club, "Published assignments stay fixed. Adjust court ladder attendance before publishing the next round.", 409);
  insist(
    s.format !== "singles",
    "Choose singles opponents when adding a game.",
  );
  const index = book.sessions.indexOf(s);
  insist(
    index === book.sessions.length - 1 && !s.submitted,
    "Attendance can change only in the current open session.",
    409,
  );
  insist(
    Array.isArray(input.names) && input.names.length <= maxPlayers,
    "Choose up to 16 attending players.",
  );
  const names = input.names.map((n) => cleanName(n, 40, "player name"));
  const before = s.active ?? s.roster;
  const regular = resolvePlayers(book, s, names, input.guestNames ?? [], false);
  const active = new Set(regular);
  insist(
    active.size !== before.length || before.some((id) => !active.has(id)),
    "Attendance already matches this selection.",
    409,
  );
  const locked = (g: Game) => !!(g.score || g.started);
  const old = s.games;
  const anchors = old.filter(locked);
  // Keep original attendance for completed rounds. A joined or departed player never changes an earlier bye.
  const oldRounds = new Map(old.map((g) => [g.round, eligibleAt(s, g.round)]));
  const unfinished = old.find((g) => !locked(g));
  const from = Math.min(
    s.resumeRound ?? Infinity,
    unfinished?.round ?? Infinity,
  );
  const version = (s.drawVersion ?? 0) + 1,
    prefix = "v" + version + "-";
  const remaining = old.filter((g) => !locked(g));
  let proposed: Game[] = [];
  const capacity = Math.min(s.courts, courtCapacity(regular.length));
  const rounds: Record<string, string[]> = { ...s.attendanceByRound };
  const atRound = (known: Game[]) => [
    ...new Set([...regular, ...known.flatMap(onCourt)]),
  ];
  if (s.format === "fixed") {
    const available = fixedTeamsPlaying(s, regular);
    insist(
      available.flatMap((t) => t.pair).length === regular.length,
      "Mark attendance in whole named teams.",
    );
    const boundary = Math.max(0, ...anchors.map((g) => g.round));
    proposed = [...anchors];
    const future = capacity
      ? fixedDraw(available, capacity, anchors, boundary + 1, prefix)
      : [];
    proposed.push(...future);
    for (const n of new Set(anchors.map((g) => g.round)))
      rounds[n] = oldRounds.get(n) ?? regular;
    for (const g of future) rounds[g.round] = regular;
  } else {
    const future = capacity
      ? schedule(
          regular,
          capacity,
          book.rules.rounds,
          book.sessions.slice(0, index),
          book.id + s.id + prefix,
        )
      : [];
    for (let round = 1; round <= book.rules.rounds; round++) {
      const previous = old.filter((g) => g.round === round),
        kept = previous.filter(locked);
      if (round < from) {
        proposed.push(...kept);
        if (previous.length) rounds[round] = oldRounds.get(round)!;
        continue;
      }
      const onDeck = [...kept],
        used = new Set(kept.flatMap(onCourt));
      if (!kept.length) {
        for (const g of future.filter((g) => g.round === round)) {
          onDeck.push({ ...g, id: prefix + g.id });
        }
      } else {
        const occupied = new Set(kept.map((g) => g.court));
        for (let court = 1; court <= s.courts; court++) {
          if (occupied.has(court)) continue;
          const choices = regular.filter((id) => !used.has(id));
          if (choices.length < 4) break;
          const same = previous.find(
            (g) =>
              g.court === court &&
              onCourt(g).every((id) => choices.includes(id)),
          );
          const pick =
            same ??
            schedule(
              choices,
              1,
              1,
              book.sessions.slice(0, index),
              prefix + round + "-" + court,
            )[0];
          onDeck.push(
            same ?? {
              ...pick,
              id: prefix + "r" + round + "c" + court,
              round,
              court,
            },
          );
          onCourt(pick).forEach((id) => used.add(id));
        }
      }
      rounds[round] =
        kept.length && kept.length === previous.length
          ? oldRounds.get(round)!
          : atRound(kept);
      proposed.push(...onDeck.sort((a, b) => a.court - b.court));
    }
  }
  proposed.sort((a, b) => a.round - b.round || a.court - b.court);
  // Preserve identifiers for untouched assignments. A stale score for a changed matchup must never apply.
  for (let i = 0; i < proposed.length; i++) {
    const g = proposed[i];
    if (locked(g)) continue;
    const same = remaining.find(
      (o) =>
        o.round === g.round &&
        o.court === g.court &&
        o.a.join("/") === g.a.join("/") &&
        o.b.join("/") === g.b.join("/"),
    );
    if (same) proposed[i] = same;
  }
  s.roster = [...new Set([...s.roster, ...regular])];
  s.active = regular;
  s.attendanceByRound = rounds;
  s.drawVersion = version;
  s.games = proposed;
  if (!capacity && (remaining.length || s.paused || !anchors.length)) {
    s.paused = true;
    s.resumeRound = Number.isFinite(from) ? from : 1;
  } else {
    delete s.paused;
    delete s.resumeRound;
  }
  const labels = new Map(people(book, s).map((p) => [p.id, p.name]));
  const affected = proposed.filter((g) => !old.some((o) => o.id === g.id));
  return {
    preserved: anchors.length,
    removed: old.filter((o) => !proposed.some((g) => o.id === g.id)).length,
    paused: !!s.paused,
    added: affected.map((g) => ({
      round: g.round,
      court: g.court,
      teamA: g.a.map((p) => labels.get(p)).join(" & "),
      teamB: g.b.map((p) => labels.get(p)).join(" & "),
    })),
  };
}
export function recap(book: Book, s: Session) {
  const through = {
    ...book,
    sessions: book.sessions.slice(0, book.sessions.indexOf(s) + 1),
  };
  const total = new Map(standings(through).map((p) => [p.id, p.points]));
  return standings(book, s).map((p) => ({
    ...p,
    average: p.played ? p.points / p.played : null,
    season: s.format === "fixed" ? null : (total.get(p.id) ?? null),
  }));
}
