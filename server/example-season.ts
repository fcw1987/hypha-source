import { addSession, newBook } from "../lib/rotation.ts";
import { defaults, exampleId, record } from "../lib/scorebook.ts";
import type { Book, Score } from "../lib/scorebook.ts";

// Fictional, fixed team scores in each printed matchup's left-to-right order.
const nights: Score[][] = [
  [[8, 11], [11, 6], [11, 10], [5, 11], [9, 11], [7, 11], [11, 10], [7, 11], [6, 11]],
  [[11, 10], [11, 6], [6, 11], [11, 8], [6, 11], [11, 5], [11, 9], [9, 11], [10, 11]],
  [[11, 6], [3, 11], [11, 8], [11, 9], [4, 11], [11, 7], [4, 11], [11, 8], [11, 4]],
  [[11, 5], [3, 11], [11, 4], [5, 11], [11, 7], [11, 8], [11, 7], [11, 8], [10, 11]],
  [[11, 9], [11, 10], [9, 11], [11, 6], [11, 8], [11, 6], [11, 9], [11, 9], [11, 9]],
  [[10, 11], [11, 7], [11, 7], [4, 11], [7, 11], [3, 11], [11, 8], [7, 11], [6, 11]],
  [[11, 8], [9, 11], [11, 9], [10, 11], [9, 11], [9, 11], [8, 11], [11, 7], [10, 11]],
  [[11, 7], [11, 9], [9, 11], [6, 11], [11, 6], [6, 11], [5, 11], [11, 7], [11, 5]],
  [[11, 7], [11, 7], [4, 11], [8, 11], [11, 8], [11, 10], [11, 4], [8, 11], [11, 9]],
  [[11, 7], [6, 11], [9, 11], [11, 10], [11, 7], [11, 8], [11, 9], [8, 11], [11, 10]],
  [[11, 9], [9, 11], [7, 11], [11, 7], [11, 9], [8, 11]],
];

let cached: Book | undefined;
export function exampleSeason(): Book {
  if (cached) return cached;
  const names = ["Pip Moonfern", "Bea Brightwing", "Kit Starfall", "Rae Rainwhistle"];
  const night = (i: number) => ({
    id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    names, courts: 1,
    date: new Date(Date.UTC(2025, 3, 2 + 7 * i)).toISOString().slice(0, 10),
  });
  const book = newBook("The Lantern League", defaults, night(0));
  for (const [i, scores] of nights.entries()) {
    if (i > 0) addSession(book, night(i));
    const session = book.sessions[i];
    // The final night ended on the first crossing. Only played games belong in its recap.
    session.games = session.games.slice(0, scores.length);
    record(book, session.id, scores.map((score, j) => ({
      id: session.games[j].id, score, before: null,
    })), true);
  }
  // This identifier can never be a writable thread UUID.
  book.id = exampleId;
  cached = book;
  return book;
}
