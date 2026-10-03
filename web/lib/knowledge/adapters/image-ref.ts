// Default image link for runtime entries at <repo>/knowledge/entries/<entry_id>/rev-<n>.md.
// Event refs are web-root paths ("/fixtures/…", served from web/public); entries need relative
// links so they open in a Markdown viewer. Already-relative refs are kept.

export function knowledgeImageRef(ref: string): string {
  return ref.startsWith("/") ? `../../../web/public${ref}` : ref;
}
