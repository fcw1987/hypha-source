import { clubCourtLimit, clubMaxPlayers, clubOptions } from "./club-options.ts";
import { clubRoundRobin } from "./club-round-robin.ts";
import { cleanName, insist, integer } from "./scorebook.ts";
import type { Game, Score, Session, Side } from "./scorebook.ts";

export interface TournamentOptions {
  entry: "pools" | "seeded";
  qualifiers: 2 | 4;
  bronze: boolean;
  division: "open" | "mixed";
}

export interface TournamentPoolRow {
  id: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  headWins: number;
  difference: number;
  headDifference: number;
}
export interface TournamentTieOrder {
  pool: number;
  order: string[];
  reason: string;
}
export interface TournamentSlot {
  a: string;
  b: string | null;
  gameId: string | null;
}
export interface TournamentStage {
  number: number;
  size: number;
  firstRound: number;
  lastRound: number;
  slots: TournamentSlot[];
  bronze?: TournamentSlot;
  publishedFromRevision?: number;
}
export interface TournamentBracket {
  pools: string[][];
  poolLastRound: number;
  seeds: string[];
  stages: TournamentStage[];
  seeding?: TournamentPoolRow[][];
  orders?: TournamentTieOrder[];
}

export function tournamentEntryLabel(s: Session, id: string, names: ReadonlyMap<string, string>) {
  return s.club?.play === "fixed"
    ? s.teams?.find(team => team.id === id)?.name ?? "Team" : names.get(id) ?? "Player";
}

export function tournamentStageLabel(size: number) {
  if (size === 2) return "Final";
  if (size === 4) return "Semifinals";
  if (size === 8) return "Quarterfinals";
  return "Round of " + size;
}

export function seededOpening(seeds: string[]) {
  insist(integer(seeds.length, 2, 48) && new Set(seeds).size === seeds.length,
    "Choose two to 48 distinct bracket entrants.");
  let places = [1, 2];
  while (places.length < seeds.length) {
    const opposite = 2 * places.length + 1;
    places = places.flatMap(seed => [seed, opposite - seed]);
  }
  const matches: { a: string; b: string | null }[] = [];
  for (let i = 0; i < places.length; i += 2) {
    matches.push({ a: seeds[places[i] - 1], b: seeds[places[i + 1] - 1] ?? null });
  }
  return matches;
}

function sides(s: Session): Map<string, Side> {
  if (s.club?.play === "fixed")
    return new Map(s.teams?.map(t => [t.id, t.pair]));
  return new Map(s.roster.map(id => [id, [id]]));
}

export function openTournament(s: Session) {
  const club = s.club;
  insist(club?.draw === "tournament" && !s.submitted, "Choose an open tournament.", 409);
  insist(!club.bracket && !s.games.length, "The tournament already has a draw.", 409);
  const validated = clubOptions(club);
  const options = validated.tournament!;
  insist(integer(s.courts, 1, clubCourtLimit(club.play)) && integer(s.roster.length, 2, clubMaxPlayers) &&
    new Set(s.roster).size === s.roster.length && s.roster.every(id => typeof id === "string" && id.length),
    "Check the attending roster and available courts.");
  const entrants = sides(s);
  if (club.play === "fixed") {
    const members = [...entrants.values()].flat();
    const present = new Set(s.roster);
    insist(entrants.size === s.teams?.length && [...entrants.values()].every(pair => pair.length === 2) &&
      members.length === present.size && new Set(members).size === members.length &&
      members.every(id => present.has(id)), "Assign each attending player to one complete fixed team.");
  }
  const ids = [...entrants.keys()];
  insist(ids.length >= 2 && ids.every(id => typeof id === "string" && id.length),
    "The bracket needs at least two distinct entrants.");
  const count = validated.pools ?? 1;
  const pooled = options.entry === "pools";
  const field = pooled ? options.qualifiers : ids.length;
  insist(field <= ids.length && (count !== 2 || field === 4),
    "Use top two or top four in one pool, or top two from each of two pools.");
  insist(!options.bronze || field >= 4, "A bronze game needs at least four knockout entrants.");
  const pools: string[][] = pooled ? Array.from({ length: count }, () => []) : [];
  let games: Game[] = [];
  let poolByPlayer: Record<string,number> | undefined;
  if (pooled) {
    ids.forEach((id, i) => pools[i % count].push(id));
    const draw: Session = { ...s, club: { play: club.play, draw: "round-robin", movement: "up-down", pools: count, queue: [] } };
    games = clubRoundRobin(draw);
    poolByPlayer = draw.club!.poolByPlayer;
  }
  club.bracket = { pools, poolLastRound: games.at(-1)?.round ?? 0, seeds: pooled ? [] : ids, stages: [] };
  if (poolByPlayer) club.poolByPlayer = poolByPlayer;
  s.games.push(...games);
}

function validFinal(game: Game) {
  if ("voided" in game && game.voided === true) return null;
  const score = game.score;
  return score?.length === 2 && score.every(n => integer(n, 0, 999)) && score[0] !== score[1]
    ? score : null;
}

function poolOrder(a: TournamentPoolRow, b: TournamentPoolRow) {
  return b.wins - a.wins || b.headWins - a.headWins ||
    b.difference - a.difference || b.headDifference - a.headDifference;
}

function poolResults(s: Session) {
  const bracket = s.club?.bracket;
  const rows = (bracket?.pools ?? []).map(pool => pool.map((id): TournamentPoolRow => ({
    id, rank: 1, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
    headWins: 0, difference: 0, headDifference: 0,
  })));
  const expected = rows.reduce((sum, pool) => sum + pool.length * (pool.length - 1) / 2, 0);
  const member = new Map(rows.flatMap((pool, i) => pool.map(row => [row.id, { pool: i, row }] as const)));
  const sideKey = (side: Side) => JSON.stringify([...side].sort());
  const sideId = new Map([...sides(s)].map(([id, side]) => [sideKey(side), id]));
  const finals: { a: TournamentPoolRow; b: TournamentPoolRow; score: Score }[] = [];
  const seen = new Set<string>();
  const games = bracket ? s.games.filter(g => g.round <= bracket.poolLastRound) : [];
  for (const game of games) {
    const score = validFinal(game);
    if (!score) continue;
    const a = member.get(sideId.get(sideKey(game.a))!), b = member.get(sideId.get(sideKey(game.b))!);
    if (!a || !b || a.pool !== b.pool || a.row === b.row) continue;
    const key = JSON.stringify([a.row.id, b.row.id].sort());
    if (seen.has(key)) continue;
    seen.add(key);
    finals.push({ a: a.row, b: b.row, score });
    for (const [i, row] of [a.row, b.row].entries()) {
      const own = score[i], other = score[1 - i];
      row.played++;
      row.pointsFor += own;
      row.pointsAgainst += other;
      row.difference += own - other;
      if (own > other) row.wins++;
      else row.losses++;
    }
  }
  // Head-to-head measures use exactly the entrants tied on total wins in this pool.
  for (const { a, b, score } of finals) {
    if (a.wins !== b.wins) continue;
    (score[0] > score[1] ? a : b).headWins++;
    a.headDifference += score[0] - score[1];
    b.headDifference += score[1] - score[0];
  }
  for (const pool of rows) {
    pool.sort(poolOrder);
    pool.forEach((row, i) => {
      row.rank = i && poolOrder(pool[i - 1], row) === 0 ? pool[i - 1].rank : i + 1;
    });
  }
  return { rows, complete: expected > 0 && games.length === expected && finals.length === expected };
}

export const tournamentStandings = (s: Session) => poolResults(s).rows;
export const tournamentPoolComplete = (s: Session) => poolResults(s).complete;

function tiedPlaces(rows: TournamentPoolRow[][], qualifiers: number) {
  const ties: { pool: number; rank: number; ids: string[] }[] = [];
  rows.forEach((pool, i) => {
    const cutoff = qualifiers / rows.length;
    const ranks = new Set(pool.slice(0, cutoff).map(row => row.rank));
    for (const rank of ranks) {
      const ids = pool.filter(row => row.rank === rank).map(row => row.id);
      if (ids.length > 1) ties.push({ pool: i + 1, rank, ids });
    }
  });
  return ties;
}

export function tournamentTies(s: Session) {
  const club = s.club;
  if (!club?.bracket || club.bracket.stages.length || !club.tournament) return [];
  const result = poolResults(s);
  return result.complete ? tiedPlaces(result.rows, club.tournament.qualifiers) : [];
}

function orderQualifiers(rows: TournamentPoolRow[][], qualifiers: number, input: unknown) {
  const ties = tiedPlaces(rows, qualifiers);
  insist(Array.isArray(input) && input.length === ties.length,
    "Enter an order and a reason for each unresolved qualifying tie.", 409);
  const orders: TournamentTieOrder[] = [];
  const used = new Set<number>();
  for (const tie of ties) {
    const index = input.findIndex((v, i) => !used.has(i) && v?.pool === tie.pool &&
      Array.isArray(v.order) && v.order.length === tie.ids.length &&
      new Set(v.order).size === tie.ids.length && tie.ids.every(id => v.order.includes(id)));
    insist(index >= 0, "Only reorder the entrants in the listed tied group.", 409);
    used.add(index);
    const order: string[] = [...input[index].order];
    const reason = cleanName(input[index].reason, 160, "tie decision reason");
    const pool = rows[tie.pool - 1];
    const byId = new Map(pool.map(row => [row.id, row]));
    pool.splice(tie.rank - 1, order.length, ...order.map(id => byId.get(id)!));
    orders.push({ pool: tie.pool, order, reason });
  }
  const take = qualifiers / rows.length;
  const seeds: string[] = [];
  // Interleaving pool places gives A1/B2 and B1/A2 in the standard four-slot bracket.
  for (let i = 0; i < take; i++) for (const pool of rows) seeds.push(pool[i].id);
  return { rows, orders, seeds };
}

type Pairing = { a: string; b: string | null };

function stageDraw(s: Session, pairs: Pairing[], bronze?: Pairing) {
  const state = s.club!.bracket!;
  const size = pairs.length * 2, number = state.stages.length + 1;
  const firstRound = (s.games.at(-1)?.round ?? 0) + 1;
  const entrants = sides(s);
  const games: Game[] = [];
  function slot(pair: Pairing, key: string): TournamentSlot {
    if (pair.b === null) return { ...pair, gameId: null };
    const a = entrants.get(pair.a), b = entrants.get(pair.b);
    insist(a && b && pair.a !== pair.b, "Review the knockout entrants.", 409);
    const gameId = "kt" + number + "-" + key;
    const court = games.length % s.courts + 1;
    const round = firstRound + Math.floor(games.length / s.courts);
    games.push({ id: gameId, court, round, a: [...a], b: [...b], score: null });
    return { ...pair, gameId };
  }
  const slots = pairs.map((pair, i) => slot(pair, String(i + 1)));
  const bronzeSlot = bronze && slot(bronze, "bronze");
  const stage: TournamentStage = {
    size, number, firstRound, lastRound: games.at(-1)!.round, slots,
    ...(bronzeSlot ? { bronze: bronzeSlot } : {}),
  };
  return { games, stage };
}

function slotResult(slot: TournamentSlot, byId: Map<string, Game>) {
  if (slot.b === null) return { winner: slot.a, loser: null };
  const game = slot.gameId && byId.get(slot.gameId);
  const score = game && validFinal(game);
  if (!score) return { winner: null, loser: null };
  return score[0] > score[1] ? { winner: slot.a, loser: slot.b } : { winner: slot.b, loser: slot.a };
}

export function nextTournament(s: Session, expectedStage: unknown, orders: unknown = []) {
  const club = s.club, bracket = club?.bracket, options = club?.tournament;
  insist(club?.draw === "tournament" && bracket && options && !s.submitted, "Choose an open tournament.", 409);
  insist(expectedStage === bracket.stages.length, "The bracket has changed. Refresh and preview again.", 409);
  let seeding: ReturnType<typeof orderQualifiers> | undefined;
  let pairs: Pairing[];
  let bronze: Pairing | undefined;
  const current = bracket.stages.at(-1);
  if (!current && options.entry === "pools") {
    const result = poolResults(s);
    insist(result.complete, "Save a final for every distinct match in every pool first.", 409);
    seeding = orderQualifiers(result.rows, options.qualifiers, orders);
    pairs = seededOpening(seeding.seeds);
  } else {
    insist(Array.isArray(orders) && !orders.length, "Tie orders apply only to unresolved pool qualification.", 409);
    if (!current) {
      pairs = seededOpening(bracket.seeds);
    } else {
      insist(current.size > 2, "The final is already published.", 409);
      const byId = new Map(s.games.map(g => [g.id, g]));
      const results = current.slots.map(slot => slotResult(slot, byId));
      insist(results.every(r => r.winner !== null), "Save a winner for every match in the current stage first.", 409);
      pairs = [];
      for (let i = 0; i < results.length; i += 2)
        pairs.push({ a: results[i].winner!, b: results[i + 1].winner! });
      if (current.size === 4 && options.bronze) {
        insist(results[0].loser && results[1].loser, "A bronze match needs two semifinal losers.", 409);
        bronze = { a: results[0].loser, b: results[1].loser };
      }
    }
  }
  const draw = stageDraw(s, pairs, bronze);
  if (seeding) {
    bracket.seeding = seeding.rows;
    bracket.orders = seeding.orders;
    bracket.seeds = seeding.seeds;
  }
  bracket.stages.push(draw.stage);
  s.games.push(...draw.games);
}

// A stage bye advances directly. Only entrants with an issued game on this
// or a later wave of this stage can be waiting for a physical court.
export function tournamentWavePlayers(s: Session, round: number): string[] | undefined {
  const bracket = s.club?.bracket;
  if (!bracket || round <= bracket.poolLastRound) return undefined;
  const stage = bracket.stages.find(st => round >= st.firstRound && round <= st.lastRound);
  if (!stage) return [];
  const playing = new Set<string>();
  for (const game of s.games) {
    if (game.round < round || game.round > stage.lastRound) continue;
    for (const id of [...game.a, ...game.b]) playing.add(id);
  }
  return s.roster.filter(id => playing.has(id));
}

export function tournamentResult(s: Session) {
  const stage = s.club?.bracket?.stages.at(-1);
  if (stage?.size !== 2) return { champion: null, runnerUp: null, bronze: null };
  const byId = new Map(s.games.map(g => [g.id, g]));
  const final = slotResult(stage.slots[0], byId);
  return { champion: final.winner, runnerUp: final.loser, bronze: stage.bronze ? slotResult(stage.bronze, byId).winner : null };
}

export function tournamentPhase(s: Session): "seeding" | "pools" | "knockout" | "complete" {
  const stage = s.club?.bracket?.stages.at(-1);
  if (!stage) return s.club?.tournament?.entry === "pools" ? "pools" : "seeding";
  const result = tournamentResult(s);
  return result.champion && (!stage.bronze || result.bronze) ? "complete" : "knockout";
}

export function guardTournamentScore(s: Session, game: Game, next: Score | null) {
  const stages = s.club?.bracket?.stages;
  if (!stages || stages.length < 2 || !game.score) return;
  const issued = stages.slice(0, -1).some(stage => stage.slots.some(slot => slot.gameId === game.id));
  if (!issued) return;
  insist(next && next[0] !== next[1] && (next[0] > next[1]) === (game.score[0] > game.score[1]),
    "That winner already feeds a published knockout stage. A correction must keep the same winner.", 409);
}
