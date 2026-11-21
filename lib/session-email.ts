import { exampleId, formatLabel, gameRuleLabel, pairLabel, people, standings } from "./scorebook.ts";
import type { Book, Session } from "./scorebook.ts";
import { tournamentEntryLabel, tournamentPoolDispositions, tournamentResult } from "./tournament.ts";

export function sessionEmailRecap(book: Book, session: Session) {
  const number = book.sessions.findIndex((item) => item.id === session.id) + 1;
  const fixed = session.format === "fixed";
  const names = new Map(people(book, session).map((p) => [p.id, p.name]));
  const lines = [
    book.name,
    `Session ${number} | ${session.date} | ${formatLabel(session)}`,
  ];
  if (session.club?.timed) lines.push("Timed games | " + gameRuleLabel(book.rules, session));
  const dispositions = tournamentPoolDispositions(session);
  if (session.club?.draw === "tournament") {
    const { champion, runnerUp, bronze } = tournamentResult(session);
    if (champion) lines.push("Champion: " + tournamentEntryLabel(session, champion, names));
    if (runnerUp) lines.push("Runner-up: " + tournamentEntryLabel(session, runnerUp, names));
    if (bronze) lines.push("Bronze: " + tournamentEntryLabel(session, bronze, names));
    let voids = 0, excluded = 0;
    for (const status of dispositions.values()) {
      if (status === "void") voids++;
      else excluded++;
    }
    if (voids) lines.push(voids + (voids === 1 ? " unplayed game void" : " unplayed games void") + " after pool withdrawal.");
    if (excluded) lines.push(excluded + (excluded === 1 ? " played final excluded" : " played finals excluded") + " from pool standings. Session points include all played finals.");
  }
  if (book.id === exampleId) lines.push("Fictional example season");
  lines.push(
    "",
    fixed ? "Team standings by session points" : "Player standings by session points",
  );

  let rank = 0;
  standings(book, session).forEach((row, i, rows) => {
    if (i === 0 || rows[i - 1].points !== row.points) rank = i + 1;
    const unit = row.points === 1 ? "point" : "points";
    lines.push(`${rank}. ${row.name} — ${row.points} ${unit}`);
  });

  lines.push("", "Completed games");
  session.games.forEach((game, i) => {
    if (!game.score) return;
    const court = session.courts > 1 ? ` (Court ${game.court})` : "";
    const a = pairLabel(session, game.a, names);
    const b = pairLabel(session, game.b, names);
    const note = dispositions.get(game.id) === "excluded" ? " · Excluded from pool standings" : "";
    lines.push(`Game ${i + 1}${court} · ${a} ${game.score[0]}–${game.score[1]} ${b}${note}`);
  });
  return {
    subject: `Hypha results | ${book.name} | ${session.date}`,
    body: lines.join("\n"),
  };
}

export function emailDraft(
  recap: { subject: string; body: string },
  recipient: string,
) {
  // The caller supplies one address validated by the native email field, or an empty string.
  const to = recipient.trim().split("@").map(encodeURIComponent).join("@");
  const fields = new URLSearchParams({
    subject: recap.subject.replace(/[\r\n\u0085\u2028\u2029]+/g, " "),
  });
  const prefix = `mailto:${to}?`;
  const subjectOnly = prefix + fields.toString().replace(/\+/g, "%20");
  fields.set("body", recap.body.replace(/\r\n|\r|\n/g, "\r\n"));
  const full = prefix + fields.toString().replace(/\+/g, "%20");
  // Mail handlers differ on URL length. Keep the full text available for copying.
  const needsPaste = full.length > 2000;
  return { href: needsPaste ? subjectOnly : full, needsPaste };
}
