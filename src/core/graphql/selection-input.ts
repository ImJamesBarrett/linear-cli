import { loadTextInput } from "../util/json-input.js";

export async function loadSelectionOverride(
  value: string,
  options: {
    cwd?: string;
  } = {},
): Promise<string> {
  const text = await loadTextInput(value, {
    cwd: options.cwd,
    label: "selection input",
  });

  return normalizeSelectionOverride(text);
}

export function normalizeSelectionOverride(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

