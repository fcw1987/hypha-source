import type { Game, Session, Side } from "./scorebook.ts";
import { insist, integer } from "./scorebook.ts";
import { schedule } from "./rotation.ts";
import { clubCourtLimit, clubMaxPlayers, clubOptions } from "./club-options.ts";

interface Match {
  a: Side;
  b: Side;
}

// Each turn pairs every entrant once, except for the single bye in an odd pool.
function opponentRounds(pool: Side[], limit?: number): Match[][] {
  const ring: (Side | undefined)[] = [...pool];
  if (ring.length % 2) ring.push(undefined);
  const turns = Math.min(limit ?? ring.length - 1, ring.length - 1);
  const result: Match[][] = [];
  for (let turn = 0; turn < turns; turn++) {
    const matches: Match[] = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i], b = ring[ring.length - 1 - i];
      if (a && b) matches.push({ a, b });
    }
    result.push(matches);
    ring.splice(1, 0, ring.pop());
  }
  return result;
}

function courtWaves(pools: Match[][][], courts: number): Game[] {
  const waves: Game[][] = [];
  // A side is either one player or an intact pair. Its first member identifies it.
  const lastWave = new Map<string, number>();
  const lastPlayed = (m: Match) =>
    Math.max(lastWave.get(m.a[0]) ?? 0, lastWave.get(m.b[0]) ?? 0);
  const turns = Math.max(...pools.map(pool => pool.length));
  for (let turn = 0; turn < turns; turn++) {
    const groups = pools.map(pool => pool[turn] ?? []);
    const matches: Match[] = [];
    // Deal a match from each pool in turn when they share physical courts.
    const most = Math.max(...groups.map(group => group.length));
    for (let i = 0; i < most; i++) {
      for (let p = 0; p < groups.length; p++) {
        const match = groups[(p + turn) % groups.length][i];
        if (match) matches.push(match);
      }
    }
    matches.sort((m, n) => lastPlayed(m) - lastPlayed(n));
    for (const match of matches) {
      // Fill an open slot from an earlier turn when both entrants are free.
      let round = lastPlayed(match) + 1;
      while (waves[round - 1]?.length === courts) round++;
      const wave = (waves[round - 1] ??= []);
      const court = wave.length + 1;
      wave.push({
        id: "r" + round + "c" + court, round, court,
        a: [...match.a], b: [...match.b], score: null,
      });
      lastWave.set(match.a[0], round);
      lastWave.set(match.b[0], round);
    }
  }
  return waves.flat();
}

export function clubRoundRobin(session: Session): Game[] {
  const club = session.club;
  insist(club?.draw === "round-robin", "Choose a round-robin or mixer draw.");
  const { play, rounds, pools: poolCount = 1 } = clubOptions(club);
  const { roster, courts } = session;
  const singles = play === "singles";
  insist(
    Array.isArray(roster) && integer(roster.length, singles ? 2 : 4, clubMaxPlayers) &&
      roster.every(id => typeof id === "string" && id.length > 0) &&
      new Set(roster).size === roster.length,
    "Check the attending roster. Each player needs a distinct place in the draw.",
  );
  insist(integer(courts, 1, clubCourtLimit(play)), "Choose a valid number of available courts.");
  if (play === "split") {
    return schedule(roster, Math.min(courts, Math.floor(roster.length / 4)), rounds ?? 9, [], session.id);
  }

  const entrants: Side[] = singles ? roster.map(id => [id]) : (session.teams ?? []).map(t => t.pair);
  if (!singles) {
    const ids = entrants.flat();
    const present = new Set(roster);
    insist(
      entrants.every(pair => pair.length === 2) && ids.length === roster.length &&
        new Set(ids).size === ids.length && ids.every(id => present.has(id)),
      "Assign every attending player to one intact pair.",
    );
  }
  insist(
    entrants.length >= poolCount * 2,
    "Choose up to four pools with at least two entrants in each.",
  );
  const largest = Math.ceil(entrants.length / poolCount);
  const fullTurns = largest - 1 + (largest % 2);
  insist(rounds === undefined || rounds <= fullTurns,
    "Choose between one and " + fullTurns + " pairing rounds, or play the full draw.");
  // Deal in entry order. Pool sizes differ by at most one.
  const pools: Side[][] = Array.from({ length: poolCount }, () => []);
  entrants.forEach((side, i) => pools[i % poolCount].push(side));
  if (poolCount > 1) {
    club.poolByPlayer = Object.fromEntries(
      pools.flatMap((pool, i) => pool.flatMap(side => side.map(id => [id, i + 1]))),
    );
  }
  return courtWaves(pools.map(pool => opponentRounds(pool, rounds)), courts);
}
