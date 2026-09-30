// The three sides of every question (roadmap: `stance` enum).
export const STANCES = ["for", "neutral", "against"] as const;

// "for" | "neutral" | "against", derived from the array above so the two
// can never drift apart.
export type Stance = (typeof STANCES)[number];
