import { checkDate, cleanName, defaults, exampleId, insist, integer } from "./scorebook.ts";
import type { Book } from "./scorebook.ts";
import { sessionId } from "./rotation.ts";

interface PracticeFields {
  date: string;
  drill: string;
  player: string | null;
  successes: number | null;
  attempts: number | null;
  minutes: number | null;
  note: string;
  goal: string;
}

export interface PracticeEntry extends PracticeFields {
  id: string;
  requestId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function newPracticeBook(id: unknown, name: unknown, player: unknown): Book {
  sessionId(id);
  const solo = player === undefined || player === null || (typeof player === "string" && !player.trim())
    ? null : cleanName(player, 40, "player name");
  return {
    id, name: cleanName(name, 64, "thread name"), kind: "practice", rules: { ...defaults, target: null },
    players: solo ? [{ id: "p1", name: solo }] : [], sessions: [],
  };
}

export function practicePlayers(book: Book) {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  const key = (s: string) => s.normalize("NFC").toLowerCase();
  for (const p of book.players) counts.set(key(p.name), (counts.get(key(p.name)) ?? 0) + 1);
  book.players.forEach((p, i) => labels.set(p.id, counts.get(key(p.name))! > 1
    ? p.name + " · Player " + (i + 1) : p.name));
  book.sessions.forEach((session, night) => {
    const guests = session.guests ?? [];
    const counts = new Map<string, number>();
    for (const p of guests) counts.set(key(p.name), (counts.get(key(p.name)) ?? 0) + 1);
    guests.forEach((p, i) => {
      if (labels.has(p.id)) return;
      const label = counts.get(key(p.name))! > 1 ? p.name + " · Guest " + (i + 1) : p.name + " · Guest";
      labels.set(p.id, label + ", session " + (night + 1));
    });
  });
  return labels;
}

function optionalNumber(value: unknown, min: number, max: number, message: string): number | null {
  if (value === undefined || value === null) return null;
  insist(typeof value === "number" && integer(value, min, max), message);
  return value;
}

function briefText(value: unknown, max: number, label: string) {
  if (value === undefined || value === null || value === "") return "";
  return cleanName(value, max, label);
}

function fields(book: Book, input: Record<string, unknown>): PracticeFields {
  const date = input.date;
  checkDate(date);
  const drill = cleanName(input.drill, 72, "drill name").replace(/\s+/gu, " ");
  const player = input.player ?? null;
  insist(player === null || (typeof player === "string" && practicePlayers(book).has(player)), "Choose a player from this thread.");
  const successes = optionalNumber(input.successes, 0, 999999, "Enter a whole number of successful reps from 0 to 999,999.");
  const attempts = optionalNumber(input.attempts, 1, 999999, "Enter a whole number of attempts from 1 to 999,999.");
  const minutes = optionalNumber(input.minutes, 1, 1440, "Enter 1–1,440 whole minutes.");
  insist((successes === null) === (attempts === null), "Enter both successful reps and attempts.");
  insist(attempts === null || successes! <= attempts, "Successful reps cannot exceed attempts.");
  insist(minutes !== null || attempts !== null, "Enter minutes or a count of successful reps and attempts.");
  return {
    date, drill, player, successes, attempts, minutes,
    note: briefText(input.note, 240, "note"), goal: briefText(input.goal, 160, "goal"),
  };
}

function sameFields(a: PracticeFields, b: PracticeFields) {
  return a.date === b.date && a.drill === b.drill && a.player === b.player &&
    a.successes === b.successes && a.attempts === b.attempts && a.minutes === b.minutes &&
    a.note === b.note && a.goal === b.goal;
}

// Invoked by the server inside its authorized thread compare-and-swap loop. An
// identical retry returns false so it cannot advance the thread or entry version.
export function savePractice(book: Book, input: Record<string, unknown>, access: { canEdit: boolean }) {
  insist(access.canEdit === true && book.id !== exampleId, "Read-only access. A scorekeeper can log practice.", 403);
  const version = input.beforeVersion;
  insist(typeof version === "number" && integer(version, 0, Number.MAX_SAFE_INTEGER), "Open the current practice entry before saving.");
  const entries = book.practice ?? [];
  const next = fields(book, input);
  if (input.id !== undefined && input.id !== null) {
    sessionId(input.id);
    insist(version > 0, "Open the current practice entry before editing.", 409);
    const id = input.id.toLowerCase();
    const entry = entries.find(item => item.id === id);
    insist(entry, "Practice entry unavailable in this thread.", 404);
    const same = sameFields(entry, next);
    if (same && (version === entry.version || version + 1 === entry.version)) return false;
    insist(version === entry.version, "Another edit changed this entry. Open the saved entry to review it.", 409);
    Object.assign(entry, next, { version: version + 1, updatedAt: new Date().toISOString() });
    return true;
  }

  insist(version === 0, "Reopen the practice form to start a new entry.");
  sessionId(input.requestId);
  const requestId = input.requestId.toLowerCase();
  const existing = entries.find(entry => entry.requestId === requestId);
  if (existing) {
    insist(sameFields(existing, next), "This practice entry was already saved with different details. Open the saved entry.", 409);
    return false;
  }
  const now = new Date().toISOString();
  const entry: PracticeEntry = {
    ...next, id: crypto.randomUUID(), requestId, version: 1, createdAt: now, updatedAt: now,
  };
  if (!book.practice) book.practice = [];
  book.practice.push(entry);
  return true;
}

export function drillKey(name: string) {
  return name.trim().replace(/\s+/gu, " ").normalize("NFC").toLowerCase();
}

interface MeasuredDay {
  date: string;
  successes: number;
  attempts: number;
}

// undefined selects all players. null selects only the group/unassigned entries.
export function practiceSummary(entries: readonly PracticeEntry[], drill: string, player: string | null | undefined) {
  const key = drillKey(drill);
  const filtered = entries.filter(entry => (!key || key === drillKey(entry.drill)) &&
    (player === undefined || player === entry.player));
  const days = new Map<string, MeasuredDay>();
  let minutes = 0, timedEntries = 0;
  for (const entry of filtered) {
    if (entry.minutes !== null) {
      minutes += entry.minutes;
      timedEntries++;
    }
    if (!key || player === undefined || entry.attempts === null || entry.attempts <= 0 || entry.successes === null) continue;
    const day = days.get(entry.date) ?? { date: entry.date, successes: 0, attempts: 0 };
    day.attempts += entry.attempts;
    day.successes += entry.successes;
    days.set(entry.date, day);
  }
  return {
    entries: filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
    minutes, timedEntries, measuredDays: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
