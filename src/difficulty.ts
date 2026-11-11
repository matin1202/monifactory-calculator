// Recipe data set selection: Normal (data/data.bin) or Hard (data/data-hard.bin) mode.
// Priority: URL ?mode= > localStorage "difficulty" > normal.

export type Difficulty = "normal" | "hard";

const STORAGE_KEY = "difficulty";

function parseDifficulty(value: string | null | undefined): Difficulty | null {
    const v = value?.trim().toLowerCase();
    return v === "normal" || v === "hard" ? v : null;
}

function readStoredDifficulty(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function getDifficulty(): Difficulty {
    return parseDifficulty(new URLSearchParams(window.location.search).get("mode"))
        ?? parseDifficulty(readStoredDifficulty())
        ?? "normal";
}

// Saves the mode, updates ?mode= in the URL (keeping the #hash) and reloads, since the whole repository changes.
export function setDifficulty(difficulty: Difficulty) {
    try {
        localStorage.setItem(STORAGE_KEY, difficulty);
    } catch {
        // Storage unavailable: the URL parameter still carries the mode.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("mode", difficulty);
    window.history.replaceState(window.history.state, "", url);
    window.location.reload();
}
