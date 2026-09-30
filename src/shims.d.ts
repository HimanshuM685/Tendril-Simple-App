declare module "*.mjs" {
  export function usd(atomic: unknown): string;
  export function formatError(err: unknown): string;
  export function createSession(): import("./tui/types.js").TendrilSession;
  export function dispatch(cmd?: string): Promise<void>;
  export function relaunchIfNeeded(args: string[]): void;
}
