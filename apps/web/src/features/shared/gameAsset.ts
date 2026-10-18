import manifest from "./asset-manifest.json";

// Content hashes give updated art a new URL, without invalidating old sessions.
export function gameAsset(path: string): string {
  return (manifest as Record<string,string>)[path] ?? path;
}
