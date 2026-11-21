"use client";
import { useEffect, useId, useRef, useState } from "react";
import { axisLabels, lineSegments, spreadLabels } from "../lib/progress";
import type { Checkpoint, Scope } from "../lib/progress";
import type { Player } from "../lib/scorebook";

const colors = [
  "#12644f",
  "#a94720",
  "#385da7",
  "#813e78",
  "#476625",
  "#a52e55",
  "#10667d",
  "#66511e",
];
const dashes = ["", "8 3", "2 3", "9 3 2 3"];
export function playerStyle(index: number) {
  return {
    color: colors[index % colors.length],
    dash: dashes[(index + Math.floor(index / colors.length)) % dashes.length],
  };
}
export type PlotPlayer = Player & {
  short: string;
  color: string;
  dash: string;
  values: (number | null)[];
};
export function Swatch({ color, dash }: Pick<PlotPlayer, "color" | "dash">) {
  return (
    <svg
      className="race-swatch"
      width="22"
      height="11"
      viewBox="0 0 22 11"
      aria-hidden="true"
    >
      <path
        d="M1 6H21"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}
const shortNumber = (value: number) =>
  value >= 10000
    ? new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value)
    : value.toLocaleString();

export function RaceChart({
  players,
  steps,
  scope,
  maximum,
  position,
  select,
  detailId,
}: {
  players: PlotPlayer[];
  steps: Checkpoint[];
  scope: Scope;
  maximum: number;
  position: number;
  select: (at: number) => void;
  detailId: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, measure] = useState(600);
  const pattern = useId().replace(/[^A-Za-z0-9_-]/g, "") + "-pending";
  useEffect(() => {
    if (!frame.current) return;
    const update = () => {
      if (frame.current)
        measure(Math.max(1, Math.floor(frame.current.clientWidth)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const season = scope === "season";
  const small = width < 450;
  const height = small ? 207 : 240;
  const top = 15,
    bottom = height - 28;
  const left = Math.max(28, shortNumber(maximum).length * 8 + 9);
  const endpoints = players.flatMap((p) => {
    const index = p.values.findLastIndex((v) => v !== null);
    return index < 0 ? [] : [{ p, index, value: p.values[index]! }];
  });
  const rail = Math.max(
    small ? 64 : 82,
    ...endpoints.map(
      ({ p, value }) =>
        25 + (p.short.length + 1 + shortNumber(value).length) * 8,
    ),
  );
  const right = Math.max(left + 1, width - rail);
  const count = steps.length;
  const x = (i: number) =>
    count === 1
      ? (left + right) / 2
      : left + (i * (right - left)) / (count - 1);
  const y = (v: number) =>
    top + (bottom - top) * (season ? v / maximum : 1 - v / maximum);
  const gapWidth = (right - left) / Math.max(1, count - 1);
  const ends = endpoints.map(({ p, index, value }) => ({
    id: p.id,
    p,
    index,
    value,
    y: y(value),
  }));
  const labels = spreadLabels(ends, top, bottom, 18);
  const ticks = axisLabels(
    count - 1,
    Math.max(
      2,
      Math.min(12, Math.floor((right - left) / (small ? 33 : 41)) + 1),
    ),
  );
  const unit = season ? "session" : "game";
  const description = steps[position]?.label ?? "";
  function choose(at: number) {
    select(Math.max(0, Math.min(count - 1, at)));
  }
  return (
    <div
      ref={frame}
      className="race-chart"
      role="slider"
      tabIndex={0}
      aria-label={
        "Inspect " + unit + " for " + players.map((p) => p.name).join(", ")
      }
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={position + 1}
      aria-valuetext={description}
      aria-controls={detailId}
      onKeyDown={(e) => {
        const targets: Record<string, number> = {
          ArrowLeft: position - 1,
          ArrowDown: position - 1,
          ArrowRight: position + 1,
          ArrowUp: position + 1,
          Home: 0,
          End: count - 1,
        };
        if (e.key in targets) {
          e.preventDefault();
          choose(targets[e.key]);
        }
      }}
      onClick={(e) => {
        const offset = e.clientX - e.currentTarget.getBoundingClientRect().left;
        choose(Math.round(((offset - left) / (right - left)) * (count - 1)));
      }}
    >
      <svg
        width="100%"
        height={height}
        viewBox={"0 0 " + width + " " + height}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={pattern}
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
          >
            <path
              d="M-1 1L1 -1M0 6L6 0M5 7L7 5"
              stroke="#dce4dc"
              strokeWidth="1.2"
            />
          </pattern>
        </defs>
        <rect
          x={left}
          y={top}
          width={right - left}
          height={bottom - top}
          rx="2"
          fill="#f7faf6"
        />
        {steps.map((step, i) => {
          if (step.state !== "pending" && step.state !== "unplayed" && step.state !== "void")
            return null;
          const a = Math.max(left, x(i) - gapWidth * 0.35),
            b = Math.min(right, x(i) + gapWidth * 0.35);
          return (
            <rect
              key={i}
              x={a}
              y={top}
              width={Math.max(1, b - a)}
              height={bottom - top}
              fill={"url(#" + pattern + ")"}
            />
          );
        })}
        {[0, 1, 2, 3, 4].map((i) => {
          const value = (maximum * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={right}
                y1={y(value)}
                y2={y(value)}
                stroke={value === 0 ? "#92a99b" : "#d7e2d8"}
                strokeDasharray={value === 0 ? undefined : "2 4"}
              />
              <text
                x={left - 7}
                y={y(value) + 4}
                textAnchor="end"
                className="race-axis"
              >
                {shortNumber(value)}
              </text>
            </g>
          );
        })}
        <line
          x1={x(position)}
          x2={x(position)}
          y1={top}
          y2={bottom}
          stroke="#6b7f74"
          strokeDasharray="4 4"
        />
        {players.map((p) => (
          <g key={p.id}>
            {lineSegments(p.values).map((segment, j) => (
              <g key={j}>
                {segment.length > 1 && (
                  <polyline
                    fill="none"
                    stroke={p.color}
                    strokeDasharray={p.dash}
                    strokeWidth={2.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={segment
                      .map((v) => x(v.index) + "," + y(v.value))
                      .join(" ")}
                  />
                )}
                {segment.map((v, k) => {
                  if (
                    count > 24 &&
                    v.index !== position &&
                    k !== 0 &&
                    k !== segment.length - 1
                  )
                    return null;
                  const current = v.index === position;
                  return (
                    <circle
                      key={v.index}
                      cx={x(v.index)}
                      cy={y(v.value)}
                      r={current ? 4.6 : 2.6}
                      fill={
                        steps[v.index].state === "partial" || current
                          ? "#fff"
                          : p.color
                      }
                      stroke={p.color}
                      strokeWidth={current ? 2.5 : 1.4}
                    />
                  );
                })}
              </g>
            ))}
          </g>
        ))}
        {ends.map(({ p, index, value, y: actual }) => {
          const at = labels.get(p.id)!;
          // A label can identify the last saved point without extending a line through pending games.
          const end = index === count - 1 ? x(index) : right;
          return (
            <g key={p.id}>
              <path
                d={
                  "M" +
                  (end + 4) +
                  " " +
                  actual +
                  " L" +
                  (right + 8) +
                  " " +
                  actual +
                  " L" +
                  (right + 15) +
                  " " +
                  at
                }
                stroke={p.color}
                fill="none"
                opacity=".66"
              />
              <text
                x={right + 18}
                y={at + 4}
                className="race-end"
                fill={p.color}
              >
                {p.short} {shortNumber(value)}
              </text>
            </g>
          );
        })}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={bottom + 19}
            textAnchor="middle"
            className="race-axis"
          >
            {steps[i].label.replace(/^(Game|Session) /, "")}
          </text>
        ))}
      </svg>
    </div>
  );
}
