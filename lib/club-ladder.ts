import { insist, teamFor } from "./scorebook.ts";
import type { Game, Session } from "./scorebook.ts";

function units(s: Session, ids: string[]): string[] {
  if (s.club!.play !== "fixed") return ids.slice();
  const eligible = new Set(ids);
  const teams = s.teams!.filter(t => t.pair.every(id => eligible.has(id)));
  insist(teams.length * 2 === ids.length, "Check in or withdraw both players of a registered team.");
  // A fixed team's position in the ordered waiting line follows its first player.
  const byPlayer = new Map(teams.flatMap(t => t.pair.map(p => [p, t.id] as const)));
  return [...new Set(ids.map(p => byPlayer.get(p)!))];
}

function expand(s: Session, ids: string[]) {
  if (s.club!.play !== "fixed") return ids.slice();
  const pairs = new Map(s.teams!.map(t => [t.id, t.pair]));
  return ids.flatMap(id => pairs.get(id)!);
}

const key = (a: string, b: string) => JSON.stringify(a < b ? [a,b] : [b,a]);
const pairings = [[0,1,2,3], [0,2,1,3], [0,3,1,2]];

function issue(s: Session, round: number, order: string[], eligible: string[]) {
  const c = s.club!;
  const seats = c.play === "split" ? 4 : 2;
  const filled = Math.min(s.courts, Math.floor(order.length / seats));
  insist(filled > 0, "There are too few checked-in players for a game. Adjust attendance or finish the event.");
  const previous = new Set<string>();
  const counts = new Map<string, number>();
  if (c.play === "split") {
    for (const game of s.games) {
      for (const side of [game.a, game.b]) {
        const k = key(side[0], side[1]!);
        counts.set(k, (counts.get(k) ?? 0) + 1);
        if (game.round === round - 1) previous.add(k);
      }
    }
  }
  for (let i = 0; i < filled; i++) {
    const here = order.slice(i * seats, (i + 1) * seats);
    let a: Game["a"], b: Game["b"];
    if (c.play === "singles") {
      a = [here[0]]; b = [here[1]];
    } else if (c.play === "fixed") {
      [a, b] = here.map(id => s.teams!.find(t => t.id === id)!.pair);
    } else {
      // Split last round's partners first, then prefer less-frequent partnerships.
      let best = pairings[0], bestRepeat = Infinity, bestCost = Infinity;
      for (const option of pairings) {
        const [u,v,w,x] = option.map(j => here[j]);
        const left = key(u,v), right = key(w,x);
        const repeat = Number(previous.has(left)) + Number(previous.has(right));
        const cost = (counts.get(left) ?? 0) + (counts.get(right) ?? 0);
        if (repeat < bestRepeat || (repeat === bestRepeat && cost < bestCost)) {
          best = option; bestRepeat = repeat; bestCost = cost;
        }
      }
      const [u,v,w,x] = best.map(j => here[j]); a = [u,v]; b = [w,x];
    }
    s.games.push({ id: "lr" + round + "c" + (i + 1), round, court: i + 1, a, b, score: null });
  }
  s.attendanceByRound ??= {};
  s.attendanceByRound[round] = [...eligible];
  s.active = [...eligible];
  c.queue = expand(s, order.slice(filled * seats));
}

export function openClubLadder(s: Session) {
  issue(s, 1, units(s, s.roster), s.roster);
}

export function nextClubLadder(s: Session, eligible: string[], expectedRound: unknown) {
  const c = s.club;
  insist(c?.draw === "ladder" && !s.submitted, "Choose an open court ladder.", 409);
  const round = s.games.at(-1)!.round;
  insist(round === expectedRound, "This round has changed. Refresh the board and preview again.", 409);
  const games = s.games.filter(g => g.round === round);
  insist(games.every(g => g.score && g.score[0] !== g.score[1]), "Save a final with a winner on every active court first.", 409);
  const total = games.length;
  const buckets = Array.from({ length: total }, () => [] as string[]);
  const available = units(s, eligible), present = new Set(available);
  const toUnits = (side: Game["a"]) => c.play === "fixed" ? [teamFor(s,side)!.id] : [...side];
  let bottomIncoming: string[] = [];
  for (const g of games) {
    const i = g.court - 1;
    const [winner, loser] = g.score![0] > g.score![1] ? [g.a,g.b] : [g.b,g.a];
    const wins = toUnits(winner), losses = toUnits(loser);
    buckets[Math.max(0, i - 1)].push(...wins);
    const losesTo = c.movement === "top-falls" ? (i === 0 ? total - 1 : i) : Math.min(total - 1, i + 1);
    buckets[losesTo].push(...losses);
    if (i === (c.movement === "top-falls" ? 0 : total - 1)) bottomIncoming = losses;
  }
  // On a full court the losing side stays (or falls). With a queue that side yields
  // bottom places first. Realign from the top only when attendance changes the footprint.
  const yielding = new Set(bottomIncoming);
  const playing = buckets.flat().filter(id => present.has(id) && !yielding.has(id));
  const last = bottomIncoming.filter(id => present.has(id));
  if (c.play === "split" && last.length > 1 && round % 2 === 0) last.reverse();
  playing.push(...last);
  const wasPlaying = new Set(playing);
  const priorWait = units(s, c.queue).filter(id => present.has(id));
  const waiting = [...new Set([...priorWait,...available.filter(id => !wasPlaying.has(id))])];
  const seats = c.play === "split" ? 4 : 2;
  const capacity = Math.min(s.courts, Math.floor(available.length / seats)) * seats;
  const enter = Math.min(waiting.length, capacity, Math.max(0, capacity - playing.length) + last.length);
  const retain = Math.min(playing.length, capacity - enter);
  const order = [...playing.slice(0, retain), ...waiting.slice(0, enter),
    ...waiting.slice(enter), ...playing.slice(retain)];
  insist(order.length === available.length && new Set(order).size === order.length, "Refresh this court assignment.", 409);
  issue(s, round + 1, order, eligible);
}
