const MAX_LENGTH = 80;

// "Should voting be mandatory?" -> "should-voting-be-mandatory". Letters and
// digits of any script are kept, so non-English titles get readable URLs too.
export function slugify(title: string): string {
  // Only Latin accents are dropped (é -> e). Other scripts keep their
  // combining marks, e.g. Devanagari vowel signs.
  let slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > MAX_LENGTH) {
    const cut = slug.slice(0, MAX_LENGTH);
    const lastDash = cut.lastIndexOf("-");
    slug = lastDash > 0 ? cut.slice(0, lastDash) : cut;
  }

  return slug || "question";
}
