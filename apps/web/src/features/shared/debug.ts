// Explicit override also supports local production builds (Docker).
export const gameDebugEnabled = process.env.NEXT_PUBLIC_GAME_DEBUG === "true" ||
  (process.env.NEXT_PUBLIC_GAME_DEBUG !== "false" && process.env.NODE_ENV === "development");
