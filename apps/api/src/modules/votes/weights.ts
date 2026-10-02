import type { Stance } from "@perspective/shared";

// D44: helping someone on the other side counts most.
export function voteWeight(voter: Stance, post: Stance): number {
  if (voter === post) return 1;
  if (voter === "neutral" || post === "neutral") return 2;
  return 3;
}

export function isCrossSide(voter: Stance, post: Stance): boolean {
  return voter !== post;
}
