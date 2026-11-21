import { eligibleAt, pairLabel, people } from "./scorebook.ts";
import type { Book, Game, Session, Side } from "./scorebook.ts";
import type { ClubBoxBlock } from "./club-box.ts";
import { tournamentPoolDispositions, tournamentWavePlayers, tournamentWithdrawnPlayers } from "./tournament.ts";
import { formatOf, pairKey, threadStats } from "./thread-stats.ts";

interface Wave {
  number: number;
  eligible: Set<string>;
  knockout?: Set<string>;
  assigned: Set<string>;
  pools: Set<number>;
  activeGames: number;
  finals: number;
}

interface Appearance {
  game: Game;
  side: 0 | 1;
}

// A fixed pair moves as one entrant, but the recap is selected by player ID.
export function playerFlights(session: Session, block: ClubBoxBlock) {
  const pairs = new Map(session.teams?.map(team => [team.id, team.pair]));
  const byPlayer = new Map<string, number>();
  block.flights.forEach((entrants, i) => {
    for (const id of entrants) {
      const ids = session.club?.play === "fixed" ? pairs.get(id) ?? [] : [id];
      for (const player of ids) byPlayer.set(player, i + 1);
    }
  });
  return byPlayer;
}

export function clubReport(book: Book, session: Session) {
  const stats = threadStats(book, formatOf(session), session.id);
  const confirmed = new Set(stats.matches.map(m => m.game.id));
  const players = [...new Map(people(book, session).map(p => [p.id, p])).values()];
  const names = new Map(players.map(p => [p.id, stats.names.get(p.id) ?? p.name]));
  const roster = new Set(names.keys());
  const waves = new Map<number, Wave>();
  const appearances = new Map<string, Appearance[]>();
  const width = session.club?.play === "singles" ? 1 : 2;
  const flightByWave = new Map<number, Map<string, number>>();
  for (const block of session.club?.boxes ?? []) {
    const byPlayer = playerFlights(session, block);
    for (let wave = block.firstRound; wave <= block.lastRound; wave++) flightByWave.set(wave, byPlayer);
  }
  const dispositions = tournamentPoolDispositions(session);
  const withdrawn = tournamentWithdrawnPlayers(session);
  let usedCourts = 0;

  for (const game of session.games) {
    let wave = waves.get(game.round);
    if (!wave) {
      const knockout = tournamentWavePlayers(session, game.round);
      wave = {
        number: game.round, eligible: new Set(eligibleAt(session, game.round)),
        knockout: knockout ? new Set(knockout) : undefined,
        assigned: new Set(), pools: new Set(), activeGames: 0, finals: 0,
      };
      waves.set(game.round, wave);
    }
    const ids = [...game.a, ...game.b];
    // A cancelled assignment does not become a bye for the people on its court.
    for (const id of ids) wave.assigned.add(id);
    if (dispositions.get(game.id) === "void" || ("voided" in game && game.voided === true)) continue;
    wave.activeGames++;
    if (confirmed.has(game.id)) wave.finals++;
    if (game.a.length !== width || game.b.length !== width ||
        new Set(ids).size !== width * 2 || !ids.every(id => roster.has(id))) continue;
    usedCourts = Math.max(usedCourts, game.court);
    const pool = session.club?.draw === "box"
      ? flightByWave.get(game.round)?.get(game.a[0]) : session.club?.poolByPlayer?.[game.a[0]];
    if (!wave.knockout && pool !== undefined) wave.pools.add(pool);
    for (const side of [0, 1] as const) {
      for (const id of side === 0 ? game.a : game.b) {
        const entries = appearances.get(id) ?? [];
        entries.push({ game, side });
        appearances.set(id, entries);
      }
    }
  }

  const ordered = [...waves.values()].sort((a, b) => a.number - b.number);
  for (const games of appearances.values()) games.sort((a, b) =>
    a.game.round - b.game.round || a.game.court - b.game.court);
  return { session, players, names, confirmed, appearances, waves: ordered, usedCourts, flightByWave, dispositions, withdrawn };
}

type Report = ReturnType<typeof clubReport>;
export interface SavedAppearance {
  id: string;
  round: number;
  court: number;
  partner: string | null;
  opposition: string;
  pointsFor: number;
  pointsAgainst: number;
  won: boolean;
  excluded?: true;
}

function opponentKeys(side: Side, fixed: boolean) {
  if (fixed && side.length === 2) return [pairKey(side)];
  return side;
}

function assignment(report: Report, id: string, appearances: Appearance[]) {
  const session = report.session;
  if (report.withdrawn.has(id)) return { status: "Withdrawn from pool play" };
  if (session.submitted) return { status: "Session submitted" };
  if (!report.waves.length) return { status: "Draw pending" };

  if (session.club?.draw === "ladder") {
    const wave = report.waves[report.waves.length - 1];
    const game = appearances.find(a => a.game.round === wave.number)?.game;
    if (game) {
      const status = report.confirmed.has(game.id) ? "Final recorded" :
        game.started || game.live ? "On court" : "Assigned";
      return { status, round: wave.number, court: game.court };
    }
    const status = !wave.eligible.has(id) ? "Absent from this round" :
      wave.assigned.has(id) ? "No active court assignment" : "On the waiting list";
    return { status, round: wave.number };
  }
  const pending = appearances.filter(a => !report.confirmed.has(a.game.id));
  const live = pending.find(a => a.game.started || a.game.live);
  const next = live ?? pending[0];
  if (!next) return { status: "No remaining assignment" };
  return { status: live ? "On court" : "Next scheduled game", round: next.game.round, court: next.game.court };
}

export function clubPlayerReport(report: Report, id: string) {
  const { session, names } = report;
  const appearances = report.appearances.get(id) ?? [];
  const fixed = session.club?.play === "fixed";
  const scheduledRivals = new Set<string>();
  const rivalsFaced = new Set<string>();
  const partners = new Set<string>();
  const saved: SavedAppearance[] = [];
  let wins = 0, pointsFor = 0, pointsAgainst = 0;
  let highestCourt: number | null = null;

  for (const { game, side } of appearances) {
    const own = side === 0 ? game.a : game.b;
    const opponents = side === 0 ? game.b : game.a;
    const rivals = opponentKeys(opponents, fixed);
    for (const rival of rivals) scheduledRivals.add(rival);
    if (!report.confirmed.has(game.id) || !game.score) continue;
    for (const rival of rivals) rivalsFaced.add(rival);
    const partner = own.find(player => player !== id);
    if (partner) partners.add(partner);
    const scored = game.score[side], allowed = game.score[1 - side];
    const won = scored > allowed;
    wins += Number(won);
    pointsFor += scored;
    pointsAgainst += allowed;
    if (session.club?.draw === "ladder")
      highestCourt = Math.min(highestCourt ?? game.court, game.court);
    saved.push({
      id: game.id, round: game.round, court: game.court,
      partner: partner ? names.get(partner) ?? null : null,
      opposition: pairLabel(session, opponents, names),
      pointsFor: scored, pointsAgainst: allowed, won,
      ...(report.dispositions.get(game.id) === "excluded" ? { excluded: true as const } : {}),
    });
  }
  const box = session.club?.draw === "box";
  const pool = box ? undefined : session.club?.poolByPlayer?.[id];
  const latest = session.club?.boxes?.at(-1);
  const number = latest && report.flightByWave.get(latest.firstRound)?.get(id);
  const flight = latest && number !== undefined ? { number, block: latest.number } : undefined;
  // Current withdrawal has no historical timestamp. Later waves cannot prove
  // a wait for someone whose last confirmed appearance is already in the past.
  const withdrawn = report.withdrawn.has(id);
  const lastPlayed = saved.at(-1)?.round ?? 0;
  const waits = report.waves.filter(wave => {
    if (withdrawn && wave.number > lastPlayed) return false;
    if (!wave.activeGames || wave.activeGames !== wave.finals ||
        !wave.eligible.has(id) || wave.assigned.has(id)) return false;
    if (wave.knockout) return wave.knockout.has(id);
    if (box) {
      const inBlock = report.flightByWave.get(wave.number)?.get(id);
      return inBlock !== undefined && wave.pools.has(inBlock);
    }
    return pool === undefined || wave.pools.has(pool);
  }).length;
  const difference = pointsFor - pointsAgainst;
  const team = fixed ? session.teams?.find(t => t.pair.includes(id)) : undefined;
  return {
    name: names.get(id) ?? "Player", teamName: team?.name, pool, flight, withdrawn,
    games: saved.length, wins, losses: saved.length - wins, pointsFor, pointsAgainst,
    difference, perGame: saved.length ? difference / saved.length : null,
    highestCourt, waits, partners: partners.size, faced: rivalsFaced.size,
    scheduled: scheduledRivals.size, saved, assignment: assignment(report, id, appearances),
  };
}
