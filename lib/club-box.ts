import { clubRoundRobin } from "./club-round-robin.ts";
import { insist, integer, teamFor } from "./scorebook.ts";
import type { Game, Session, Side } from "./scorebook.ts";

export interface ClubBoxBlock {
  number: number;
  firstRound: number;
  lastRound: number;
  // Entrants are player IDs in singles and registered team IDs in fixed doubles.
  flights: string[][];
}

export interface BoxStanding {
  id: string;
  seed: number;
  rank: number | null;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  winRate: number | null;
  marginPerGame: number | null;
  seedTie: boolean;
  nextFlight: number | null;
}

function entrants(s: Session) {
  return s.club?.play === "fixed" ? (s.teams ?? []).map(t => t.id) : s.roster;
}

function publish(s: Session, flights: string[][]) {
  const club = s.club!;
  const previous = club.boxes?.at(-1);
  const offset = previous?.lastRound ?? 0;
  // The round-robin draw deals across pools. Interleave the desired flight
  // memberships first so that the draw reproduces them on the shared courts.
  const order: string[] = [];
  const largest = Math.max(...flights.map(flight => flight.length));
  for (let place = 0; place < largest; place++) {
    for (const flight of flights) if (place < flight.length) order.push(flight[place]);
  }
  const teams = new Map(s.teams?.map(t => [t.id, t]));
  const draw = clubRoundRobin({
    ...s,
    roster: club.play === "singles" ? order : s.roster,
    teams: club.play === "fixed" ? order.map(id => teams.get(id)!) : undefined,
    club: { play: club.play, draw: "round-robin", movement: "up-down", pools: flights.length, queue: [] },
  });
  for (const game of draw) {
    game.round += offset;
    game.id = "br" + game.round + "c" + game.court;
  }
  const block: ClubBoxBlock = {
    number: (previous?.number ?? 0) + 1,
    firstRound: offset + 1,
    lastRound: draw.at(-1)!.round,
    flights,
  };
  // Only the new draw and its membership are persisted. Standings come from finals.
  s.games.push(...draw);
  (club.boxes ??= []).push(block);
}

export function openClubBox(s: Session) {
  const club = s.club;
  insist(club?.draw === "box" && !s.submitted, "Choose an open flight ladder.", 409);
  insist(!s.games.length && !club.boxes?.length, "The first flight block is already published.", 409);
  insist(club.play === "singles" || club.play === "fixed", "Flight ladders use singles or fixed pairs.");
  const count = club.pools;
  insist(typeof count === "number" && integer(count, 2, 4), "Choose two to four flights.");
  insist(club.rounds === undefined, "Each flight plays a full round robin in its block.");
  const seeds = entrants(s);
  insist(seeds.length >= count * 3, "Each flight needs at least three players or three fixed teams.");
  insist(new Set(seeds).size === seeds.length && seeds.every(id => typeof id === "string" && id.length),
    "Give every flight entrant a distinct place in the seed order.");
  const size = Math.floor(seeds.length / count);
  let start = 0;
  const flights = Array.from({ length: count }, (_, i) => {
    const first = start;
    start += size + Number(i < seeds.length % count);
    return seeds.slice(first, start);
  });
  publish(s, flights);
}

// Cross products compare exact rates without treating rounded display values as a tie.
function byPerformance(a: BoxStanding, b: BoxStanding) {
  if (!a.played || !b.played) return Number(b.played > 0) - Number(a.played > 0);
  return b.wins * a.played - a.wins * b.played ||
    (b.pointsFor - b.pointsAgainst) * a.played - (a.pointsFor - a.pointsAgainst) * b.played;
}

function finalScore(g: Game) {
  if ("voided" in g && g.voided === true) return null;
  const score = g.score;
  return score?.length === 2 && score.every(n => integer(n, 0, 999)) && score[0] !== score[1] ? score : null;
}

export function boxStandings(s: Session, number: number): BoxStanding[][] {
  const blocks = s.club?.boxes;
  const block = blocks?.find(b => b.number === number);
  if (!block) return [];
  const seeds = new Map(entrants(s).map((id, i) => [id, i + 1] as const));
  const flights = block.flights.map(ids => ids.map((id): BoxStanding => ({
    id, seed: seeds.get(id)!, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
    rank: null, winRate: null, marginPerGame: null, seedTie: false, nextFlight: null,
  })));
  const byId = new Map(flights.flat().map(row => [row.id, row]));
  const unit = (side: Side) => s.club?.play === "fixed" ? teamFor(s, side)?.id : side[0];
  for (const game of s.games) {
    if (game.round < block.firstRound || game.round > block.lastRound) continue;
    const score = finalScore(game);
    if (!score) continue;
    const a = byId.get(unit(game.a)!), b = byId.get(unit(game.b)!);
    insist(a && b, "Refresh the flight membership before calculating these results.", 409);
    for (const [i, row] of [a, b].entries()) {
      row.played++;
      row.pointsFor += score[i];
      row.pointsAgainst += score[1 - i];
      if (score[i] > score[1 - i]) row.wins++;
      else row.losses++;
    }
  }
  const complete = flights.every(rows => rows.every(row => row.played === rows.length - 1));
  const published = blocks?.find(b => b.number === number + 1);
  const publishedFlight = new Map(published?.flights.flatMap((ids, i) => ids.map(id => [id, i + 1] as const)));
  flights.forEach((rows, index) => {
    rows.sort((a, b) => byPerformance(a, b) || a.seed - b.seed);
    rows.forEach((row, i) => {
      // A corrected or withdrawn historical final can change the old standings.
      // The already-issued destination comes from the next block's membership.
      if (published) row.nextFlight = publishedFlight.get(row.id) ?? null;
      if (!row.played) return;
      row.winRate = row.wins / row.played;
      row.marginPerGame = (row.pointsFor - row.pointsAgainst) / row.played;
      const previous = rows[i - 1];
      if (previous && byPerformance(previous, row) === 0) {
        row.rank = previous.rank;
        previous.seedTie = row.seedTie = true;
      } else {
        row.rank = i + 1;
      }
      if (!published && complete) {
        const flight = index + 1;
        row.nextFlight = i === 0 ? Math.max(1, flight - 1) :
          i === rows.length - 1 ? Math.min(flights.length, flight + 1) : flight;
      }
    });
  });
  return flights;
}

export function nextClubBox(s: Session, expectedBlock: unknown) {
  const club = s.club;
  insist(club?.draw === "box" && !s.submitted, "Choose an open flight ladder.", 409);
  const current = club.boxes?.at(-1);
  insist(current && current.number === expectedBlock, "This block has changed. Refresh and preview again.", 409);
  const standings = boxStandings(s, current.number);
  const flights: string[][] = standings.map(() => []);
  for (const row of standings.flat()) {
    insist(row.nextFlight !== null, "Save a final with a winner for every game in the block first.", 409);
    flights[row.nextFlight - 1].push(row.id);
  }
  publish(s, flights);
}
