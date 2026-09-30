import { usd } from "../index.mjs";
import type { View } from "./types.js";

export { usd };

export function num(value: unknown) {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function clip(value: string, width: number) {
  if (width <= 1 || value.length <= width) return value;
  return `${value.slice(0, width - 1)}…`;
}

export function shortAddr(address: string | null) {
  if (!address) return "no key";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function hours(seconds: number) {
  return `${(seconds / 3600).toFixed(2)}h`;
}

export function remain(ms: number) {
  if (ms <= 0) return "0m";
  const h = ms / 3_600_000;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.max(1, Math.round(ms / 60_000))}m`;
}

/** Lease window for the gauge. Without an open time the bar stays full. */
export function leaseGauge(view: View, now = Date.now()) {
  const endRaw = view.leaseView?.expiresAt ?? view.lease?.fundedUntil;
  const end = endRaw ? Date.parse(endRaw) : NaN;
  const rate = view.leaseView?.rateAtomicPerHour;
  const rateLabel = rate != null ? `${usd(rate)}/h` : null;
  if (!Number.isFinite(end)) {
    return { value: 1, max: 1, label: rateLabel ?? "open" };
  }
  const when = new Date(end).toISOString();
  const start = view.openedAt;
  if (start == null || end <= start) {
    return { value: 1, max: 1, label: rateLabel ? `${rateLabel} until ${when}` : `until ${when}` };
  }
  const left = Math.max(0, end - now);
  const clock = `${remain(left)} left`;
  return {
    value: left,
    max: end - start,
    label: rateLabel ? `${clock} · ${rateLabel}` : clock,
  };
}
