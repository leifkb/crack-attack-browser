/**
 * Resolve a public asset against the directory that contains the current page.
 *
 * The Sites deployment lives at the origin root, while a GitHub Pages project
 * normally lives below /repository-name/. Using document.baseURI keeps both
 * deployments on the same source without hard-coding either host or path.
 */
export function publicAssetUrl(path: string, baseUrl?: string): string {
  const relativePath = path.replace(/^\/+/, "");
  const browserBase = baseUrl
    ?? (typeof document === "undefined" ? undefined : document.baseURI);
  return browserBase ? new URL(relativePath, browserBase).href : `/${relativePath}`;
}

export function gameAssetUrl(filename: string, baseUrl?: string): string {
  return publicAssetUrl(`crack-attack-assets/${filename}`, baseUrl);
}
