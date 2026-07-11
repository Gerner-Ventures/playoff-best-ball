/**
 * Normalize player names for matching
 * Removes special characters, lowercases, and trims whitespace
 */
export function normalizeName(name: string): string {
  return name
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a player in a map by name, handling variations
 */
export function findPlayerByName<T>(map: Map<string, T>, searchName: string): T | undefined {
  const normalized = normalizeName(searchName);

  // Direct match
  if (map.has(normalized)) {
    return map.get(normalized);
  }

  const searchParts = normalized.split(" ");
  const searchFirst = searchParts[0];
  const searchLast = searchParts[searchParts.length - 1];

  // Fuzzy match by last name
  for (const [key, value] of map.entries()) {
    if (!key.includes(searchLast)) continue;

    const keyFirst = key.split(" ")[0];

    // If both first names are long enough, they should match
    if (keyFirst.length > 2 && searchFirst.length > 2 && keyFirst !== searchFirst) {
      continue;
    }

    // Match if first initial matches
    if (key.startsWith(searchFirst[0])) {
      return value;
    }
  }

  return undefined;
}

/**
 * Extract last name from full name
 */
export function getLastName(fullName: string): string {
  const parts = fullName.split(" ");
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if a player name appears in text (for scoring play parsing)
 */
export function nameAppearsInText(playerName: string, text: string): boolean {
  const lastName = getLastName(playerName);
  const simpleText = text.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return lastName.length > 2 && simpleText.includes(lastName);
}
