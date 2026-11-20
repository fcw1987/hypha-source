import { cleanName, insist } from "./scorebook.ts";
import type { FixedTeam, Game, Session } from "./scorebook.ts";
export interface TeamChoice {
  name: string;
  players: [string, string];
}
export function parseTeams(
  input: unknown,
  names: string[],
  ids: string[],
): FixedTeam[] {
  insist(
    names.length % 2 === 0 &&
      Array.isArray(input) &&
      input.length === names.length / 2,
    "Fixed teams need two players per team.",
  );
  const slots = new Map(names.map((n, i) => [n.toLowerCase(), ids[i]]));
  const used = new Set<string>();
  const titles = new Set<string>();
  return input.map((team, i) => {
    const name = cleanName(team?.name, 40, "team name");
    insist(!titles.has(name.toLowerCase()), "Give every team a distinct name.");
    titles.add(name.toLowerCase());
    insist(
      Array.isArray(team.players) && team.players.length === 2,
      "Choose both players for each team.",
    );
    const pair = team.players.map((value: unknown) => {
      const id = slots.get(cleanName(value, 40, "player name").toLowerCase());
      insist(
        id && !used.has(id),
        "Assign each attending player to exactly one team.",
      );
      used.add(id);
      return id;
    }) as [string, string];
    return { id: "t" + (i + 1), name, pair };
  });
}
export function fixedDraw(
  teams: FixedTeam[],
  courts: number,
  skipGames: Game[] = [],
  start = 1,
  prefix = "",
): Game[] {
  const n = teams.length + (teams.length % 2),
    games: Game[] = [];
  if (n < 2) return games;
  const ring = [
    0,
    ...Array.from({ length: n / 2 - 1 }, (_, i) => 2 * (i + 1)),
    ...Array.from({ length: n / 2 }, (_, i) => n - 1 - 2 * i),
  ];
  const key = (a: string[], b: string[]) => [...a, ...b].sort().join("/");
  const skipped = new Set(skipGames.map((g) => key(g.a, g.b)));
  let round = start;
  for (let turn = 0; turn < n - 1; turn++) {
    const matches: { a: FixedTeam; b: FixedTeam }[] = [];
    for (let i = 0; i < n / 2; i++) {
      const indexes = [ring[i], ring[n - 1 - i]].sort((a, b) => a - b);
      const [a, b] = indexes.map((k) => teams[k]);
      if (a && b && !skipped.has(key(a.pair, b.pair))) matches.push({ a, b });
    }
    for (let j = 0; j < matches.length; j += courts) {
      matches.slice(j, j + courts).forEach(({ a, b }, court) => {
        games.push({
          id: prefix + "r" + round + "c" + (court + 1),
          round,
          court: court + 1,
          a: [...a.pair],
          b: [...b.pair],
          score: null,
        });
      });
      round++;
    }
    ring.push(ring.splice(1, 1)[0]);
  }
  return games;
}
export const fixedTeamsPlaying = (s: Session, ids: string[]) =>
  (s.teams ?? []).filter((t) => t.pair.every((p) => ids.includes(p)));
