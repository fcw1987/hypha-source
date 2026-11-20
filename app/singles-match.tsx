"use client";
import { useId } from "react";

export function selectedMatch(
  options: string[],
  selection: string[],
): string[] {
  const first = options.includes(selection[0]) ? selection[0] : options[0];
  if (!first) return [];
  const second =
    options.includes(selection[1]) && selection[1] !== first
      ? selection[1]
      : options.find((option) => option !== first);
  return second ? [first, second] : [first];
}
export function MatchPicker({
  label,
  options,
  selection,
  set,
  name,
}: {
  label: string;
  options: string[];
  selection: string[];
  set: (pair: string[]) => void;
  name: (id: string) => string;
}) {
  const ids = selectedMatch(options, selection);
  const prefix = useId();
  return (
    <fieldset className="singles-picker">
      <legend>{label}</legend>
      {options.length === 2 ? (
        <p>{ids.map(name).join(" vs ")}</p>
      ) : (
        <div className="form-pair">
          {ids.map((id, i) => (
            <label key={i} htmlFor={prefix + i}>
              {i === 0 ? "First player" : "Opponent"}
              <select
                id={prefix + i}
                value={id}
                onChange={(e) => {
                  const chosen = e.target.value,
                    next = [...ids];
                  if (next[1 - i] === chosen) next[1 - i] = id;
                  next[i] = chosen;
                  set(next);
                }}
              >
                {options.map((p) => (
                  <option key={p} value={p}>
                    {name(p)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
