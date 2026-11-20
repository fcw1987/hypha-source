"use client";
import { useState } from "react";
import { margin, rate } from "../lib/thread-stats";
import type { Order, RecordLine, StatRow, Subject } from "../lib/thread-stats";

export const recordText = (r: RecordLine) => r.wins + "–" + (r.games - r.wins);
export const gameCount = (n: number) => n + (n === 1 ? " game" : " games");
export function pct(r: RecordLine) {
  const v = rate(r);
  return v === null ? "—" : Number(v.toFixed(1)) + "%";
}
export function signed(n: number | null, digits = 2) {
  if (n === null) return "—";
  const rounded = Number(n.toFixed(digits));
  return (rounded > 0 ? "+" : rounded < 0 ? "−" : "") + Math.abs(rounded);
}
export function RecordRows({
  rows,
  metric = "rate",
  open,
  limit = 6,
  more = "records",
  empty,
  small = false,
}: {
  rows: (StatRow & { rank?: number; tied?: boolean })[];
  metric?: Order;
  open?: (s: Subject) => void;
  limit?: number;
  more?: string;
  empty?: string;
  small?: boolean;
}) {
  const [all, expand] = useState(false);
  if (!rows.length)
    return empty ? <p className="stats-muted">{empty}</p> : null;
  return (
    <>
      <ul className="stats-rows">
        {rows.slice(0, all ? undefined : limit).map((row) => {
          const r = row.line;
          const value =
            metric === "rate"
              ? pct(r)
              : metric === "margin"
                ? signed(margin(r))
                : String(r[metric]);
          const unit = {
            rate: "win rate",
            margin: "pts/game",
            wins: "wins",
            games: "games",
          }[metric];
          const content = (
            <>
              {row.rank !== undefined && (
                <span
                  className="stats-rank"
                  aria-label={(row.tied ? "Tied at rank " : "Rank ") + row.rank}
                >
                  {row.tied ? "=" : ""}
                  {row.rank}
                </span>
              )}
              <span className="stats-row-name">
                <strong>{row.label}</strong>
                <small>
                  {recordText(r)} W–L · {gameCount(r.games)}
                  {metric !== "margin" &&
                    r.games > 0 &&
                    " · " + signed(margin(r)) + " pts/game"}
                </small>
                {metric === "rate" && !small && (
                  <span className="stats-meter" aria-hidden="true">
                    <i style={{ width: (rate(r) ?? 0) + "%" }} />
                  </span>
                )}
              </span>
              <span className="stats-row-value">
                <b>{value}</b>
                <small>{unit}</small>
              </span>
            </>
          );
          return (
            <li key={JSON.stringify(row.subject)}>
              {open ? (
                <button
                  type="button"
                  className="stats-row"
                  onClick={() => open(row.subject)}
                >
                  {content}
                </button>
              ) : (
                <div className="stats-row">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <button
          className="stats-more"
          onClick={() => expand(!all)}
          aria-expanded={all}
        >
          {all ? "Show fewer " + more : "Show all " + rows.length + " " + more}
        </button>
      )}
    </>
  );
}
export function OutcomeMetrics({ line }: { line: RecordLine }) {
  return (
    <dl className="stats-metrics">
      <div>
        <dt>Win rate</dt>
        <dd>
          {pct(line)}
          <small>{recordText(line)} W–L</small>
        </dd>
      </div>
      <div>
        <dt>Avg. margin</dt>
        <dd>
          {signed(margin(line))}
          <small>points per game</small>
        </dd>
      </div>
      <div>
        <dt>Points for / against</dt>
        <dd>
          {line.pointsFor} / {line.pointsAgainst}
          <small>{gameCount(line.games)} played</small>
        </dd>
      </div>
    </dl>
  );
}
