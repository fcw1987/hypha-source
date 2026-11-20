import { courtCapacity, maxPlayers } from "../lib/scorebook.ts";

export interface PlayerField {
  id: number;
  name: string;
}
interface RosterDraft {
  fields: PlayerField[];
  nextId: number;
  minimum?: 2 | 4;
  courts: number;
}
type RosterAction =
  | { type: "name"; id: number; value: string }
  | { type: "minimum"; value: 2 | 4 }
  | { type: "add" }
  | { type: "remove"; id: number }
  | { type: "courts"; value: number };

export function attendance(fields: PlayerField[]) {
  const names = fields
    .map((field) => field.name.normalize("NFC").trim())
    .filter(Boolean);
  const count = new Set(names.map((name) => name.toLowerCase())).size;
  return {
    names,
    count,
    duplicate: count !== names.length,
    capacity: courtCapacity(count),
  };
}

function clampCourts(courts: number, capacity: number) {
  return Math.max(1, Math.min(courts, capacity));
}

export function initialRoster({
  names,
  courts,
  minimum = 4,
}: {
  names: string[];
  courts: number;
  minimum?: 2 | 4;
}): RosterDraft {
  const fields = Array.from(
    { length: Math.max(minimum, names.length) },
    (_, i) => ({
      id: i,
      name: names[i] ?? "",
    }),
  );
  return {
    fields,
    nextId: fields.length,
    minimum,
    courts: clampCourts(courts, attendance(fields).capacity),
  };
}

export function updateRoster(
  draft: RosterDraft,
  action: RosterAction,
): RosterDraft {
  if (action.type === "courts") {
    return {
      ...draft,
      courts: clampCourts(action.value, attendance(draft.fields).capacity),
    };
  }
  let fields: PlayerField[];
  let nextId = draft.nextId;
  if (action.type === "minimum") {
    fields = [...draft.fields];
    while (fields.length > action.value && !fields.at(-1)!.name.trim())
      fields.pop();
    while (fields.length < action.value)
      fields.push({ id: nextId++, name: "" });
    return { ...draft, fields, nextId, minimum: action.value };
  }
  if (action.type === "name") {
    fields = draft.fields.map((field) =>
      field.id === action.id ? { ...field, name: action.value } : field,
    );
  } else if (action.type === "add") {
    const space = Math.min(2, maxPlayers - draft.fields.length);
    if (space <= 0) return draft;
    const added = Array.from({ length: space }, () => ({
      id: nextId++,
      name: "",
    }));
    fields = [...draft.fields, ...added];
  } else {
    const index = draft.fields.findIndex((field) => field.id === action.id);
    if (index < (draft.minimum ?? 4)) return draft;
    fields = draft.fields.filter((field) => field.id !== action.id);
  }
  return {
    fields,
    nextId,
    minimum: draft.minimum,
    courts: clampCourts(draft.courts, attendance(fields).capacity),
  };
}
