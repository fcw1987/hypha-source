import { gameRuleLabel, people, scoreProblem } from "./scorebook.ts";
import type { Book, Game, Pair, Session } from "./scorebook.ts";

export type Format = "rotating" | "fixed" | "singles";
export type Order = "rate" | "margin" | "games" | "wins";
export const minimumGames = 3;
export interface RecordLine {
  games: number;
  wins: number;
  pointsFor: number;
  pointsAgainst: number;
}
export type Subject =
  | { kind: "player"; id: string }
  | { kind: "partners" | "opponents"; ids: Pair };
export interface StatRow {
  subject: Subject;
  label: string;
  line: RecordLine;
}
export interface SavedMatch {
  game: Game;
  session: Session;
  night: number;
  number: number;
}
export interface Appearance extends SavedMatch {
  side: 0 | 1;
}
export const blankLine = (): RecordLine => ({
  games: 0,
  wins: 0,
  pointsFor: 0,
  pointsAgainst: 0,
});
export const formatOf = (s: Session): Format => s.format ?? "rotating";
export const rate = (r: RecordLine) =>
  r.games ? (100 * r.wins) / r.games : null;
export const margin = (r: RecordLine) =>
  r.games ? (r.pointsFor - r.pointsAgainst) / r.games : null;
export const pairKey = (ids: Pair) => JSON.stringify([...ids].sort());

function credit(line: RecordLine, own: number, other: number) {
  line.games++;
  line.wins += Number(own > other);
  line.pointsFor += own;
  line.pointsAgainst += other;
}
export function apart(player: RecordLine, together: RecordLine): RecordLine {
  return {
    games: player.games - together.games,
    wins: player.wins - together.wins,
    pointsFor: player.pointsFor - together.pointsFor,
    pointsAgainst: player.pointsAgainst - together.pointsAgainst,
  };
}
export function reverse(line: RecordLine): RecordLine {
  return {
    games: line.games,
    wins: line.games - line.wins,
    pointsFor: line.pointsAgainst,
    pointsAgainst: line.pointsFor,
  };
}

// Names are labels only. Guests keep the distinct IDs given to them on their own night.
function displayNames(book: Book) {
  const duplicate = new Map<string, number>();
  for (const p of book.players) {
    const name = p.name.normalize("NFC").toLowerCase();
    duplicate.set(name, (duplicate.get(name) ?? 0) + 1);
  }
  const names = new Map<string, string>();
  book.players.forEach((p, i) =>
    names.set(
      p.id,
      duplicate.get(p.name.normalize("NFC").toLowerCase())! > 1
        ? p.name + " · Player " + (i + 1)
        : p.name,
    ),
  );
  book.sessions.forEach((s, i) =>
    s.guests?.forEach((p) => names.set(p.id, p.name + " · Guest S" + (i + 1))),
  );
  return names;
}
export function subjectLabel(
  subject: Subject,
  names: Map<string, string>,
): string {
  const name = (id: string) => names.get(id) ?? "Player";
  if (subject.kind === "player") return name(subject.id);
  return subject.ids
    .map(name)
    .join(subject.kind === "partners" ? " & " : " vs ");
}
function validFinal(
  g: Game,
  size: number,
  attending: Set<string>,
  rules: Book["rules"],
  session: Session,
) {
  if (!g.score || scoreProblem(g.score, rules, session)) return false;
  if ("voided" in g && g.voided === true) return false;
  if (g.a.length !== size || g.b.length !== size) return false;
  const participants = [...g.a, ...g.b];
  return (
    new Set(participants).size === size * 2 &&
    participants.every((id) => attending.has(id))
  );
}
function creditPair(
  rows: Map<string, StatRow>,
  kind: "partners" | "opponents",
  ids: Pair,
  own: number,
  other: number,
  names: Map<string, string>,
) {
  const key = pairKey(ids);
  let row = rows.get(key);
  if (!row) {
    const subject = { kind, ids: [...ids].sort() as Pair };
    row = { subject, label: subjectLabel(subject, names), line: blankLine() };
    rows.set(key, row);
  }
  // Opposition is directional. A canonical first player keeps the sign of their side.
  const flip =
    kind === "opponents" &&
    row.subject.kind === "opponents" &&
    row.subject.ids[0] !== ids[0];
  credit(row.line, flip ? other : own, flip ? own : other);
}
export function threadStats(book: Book, format: Format, sessionId = "", scoring = "") {
  const last = book.sessions.findLast(s => formatOf(s) === format && (!sessionId || s.id === sessionId));
  const rule = scoring || gameRuleLabel(book.rules, last);
  const names = displayNames(book);
  const players = new Map<string, StatRow>();
  const partners = new Map<string, StatRow>();
  const opponents = new Map<string, StatRow>();
  const matches: SavedMatch[] = [];
  let nights = 0;
  book.sessions.forEach((session, night) => {
    if (formatOf(session) !== format || (sessionId && session.id !== sessionId) || gameRuleLabel(book.rules, session) !== rule)
      return;
    nights++;
    const attending = new Set<string>();
    for (const p of people(book, session)) {
      attending.add(p.id);
      if (!players.has(p.id))
        players.set(p.id, {
          subject: { kind: "player", id: p.id },
          label: names.get(p.id)!,
          line: blankLine(),
        });
    }
    session.games.forEach((game, number) => {
      if (
        !validFinal(game, format === "singles" ? 1 : 2, attending, book.rules, session)
      )
        return;
      const [a, b] = game.score!;
      matches.push({ game, session, night: night + 1, number: number + 1 });
      for (const id of game.a) credit(players.get(id)!.line, a, b);
      for (const id of game.b) credit(players.get(id)!.line, b, a);
      if (game.a.length === 2 && game.b.length === 2) {
        creditPair(partners, "partners", game.a, a, b, names);
        creditPair(partners, "partners", game.b, b, a, names);
      }
      for (const left of game.a)
        for (const right of game.b)
          creditPair(opponents, "opponents", [left, right], a, b, names);
    });
  });
  return { format, rule, names, players, partners, opponents, matches, nights };
}
export type Stats = ReturnType<typeof threadStats>;
export function lineFor(stats: Stats, subject: Subject): RecordLine {
  if (subject.kind === "player")
    return stats.players.get(subject.id)?.line ?? blankLine();
  const row = (
    subject.kind === "partners" ? stats.partners : stats.opponents
  ).get(pairKey(subject.ids));
  if (!row || row.subject.kind === "player") return blankLine();
  return subject.kind === "opponents" && row.subject.ids[0] !== subject.ids[0]
    ? reverse(row.line)
    : row.line;
}
function compare(a: RecordLine, b: RecordLine, order: Order) {
  if (order === "wins" || order === "games") return b[order] - a[order];
  const numerator = (r: RecordLine) =>
    order === "rate" ? r.wins : r.pointsFor - r.pointsAgainst;
  return numerator(b) * a.games - numerator(a) * b.games;
}
export function rankings(rows: Iterable<StatRow>, order: Order) {
  const all = [...rows];
  const threshold = order === "rate" || order === "margin" ? minimumGames : 1;
  const small = all
    .filter((r) => r.line.games < threshold)
    .sort(
      (a, b) => b.line.games - a.line.games || a.label.localeCompare(b.label),
    );
  const eligible = all
    .filter((r) => r.line.games >= threshold)
    .sort(
      (a, b) =>
        compare(a.line, b.line, order) || a.label.localeCompare(b.label),
    );
  let rank = 0;
  const ranked = eligible.map((row, i) => {
    const previous =
      i > 0 && compare(row.line, eligible[i - 1].line, order) === 0;
    if (!previous) rank = i + 1;
    const tied =
      previous ||
      (i + 1 < eligible.length &&
        compare(row.line, eligible[i + 1].line, order) === 0);
    return { ...row, rank, tied };
  });
  return { ranked, small };
}
export function appearances(stats: Stats, subject: Subject): Appearance[] {
  const list: Appearance[] = [];
  for (const match of stats.matches) {
    const { a, b } = match.game;
    const id = subject.kind === "player" ? subject.id : subject.ids[0];
    const side = a.includes(id) ? 0 : b.includes(id) ? 1 : null;
    if (side === null) continue;
    if (subject.kind !== "player") {
      const own = side === 0 ? a : b,
        other = side === 0 ? b : a;
      if (!(subject.kind === "partners" ? own : other).includes(subject.ids[1]))
        continue;
    }
    list.push({ ...match, side });
  }
  return list;
}
export function outcomes(games: Appearance[]) {
  const line = blankLine();
  for (const { game, side } of games)
    credit(line, game.score![side], game.score![1 - side]);
  return line;
}
function opposingTeamLines(games: Appearance[], names: Map<string, string>) {
  const teams = new Map<string, StatRow>();
  for (const { game, side } of games) {
    const other = side === 0 ? game.b : game.a;
    if (other.length !== 2) continue;
    creditPair(
      teams,
      "partners",
      other,
      game.score![side],
      game.score![1 - side],
      names,
    );
  }
  return teams;
}
export function opposingTeams(games: Appearance[], names: Map<string, string>) {
  return [...opposingTeamLines(games, names).values()].sort(
    (a, b) => b.line.games - a.line.games || a.label.localeCompare(b.label),
  );
}

// A Stats value contains only games with the same format and scoring rules.
export function matchedOpponents(
  stats: Stats,
  player: string,
  first: string,
  second: string,
) {
  const rows: {
    key: string;
    label: string;
    first: RecordLine;
    second: RecordLine;
  }[] = [];
  if (first === second || stats.format === "singles") return rows;
  const byOpponent = (partner: string) =>
    opposingTeamLines(
      appearances(stats, { kind: "partners", ids: [player, partner] }),
      stats.names,
    );
  const left = byOpponent(first),
    right = byOpponent(second);
  for (const [key, a] of left) {
    const b = right.get(key);
    if (b) rows.push({ key, label: a.label, first: a.line, second: b.line });
  }
  return rows.sort(
    (a, b) =>
      Math.min(b.first.games, b.second.games) -
        Math.min(a.first.games, a.second.games) ||
      a.label.localeCompare(b.label),
  );
}
