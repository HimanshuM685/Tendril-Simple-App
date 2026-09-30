import type { ReactNode } from "react";
import { theme } from "./theme.js";

export type Slice = { label: string; value: number; color: string };
export type BarRow = { label: string; value: number; dim?: boolean };

export function Panel({
  title,
  children,
  grow = 1,
}: {
  title: string;
  children: ReactNode;
  grow?: number;
}) {
  return (
    <box
      title={title}
      titleColor={theme.dim}
      border
      borderColor={theme.border}
      backgroundColor={theme.panel}
      style={{ flexGrow: grow, flexShrink: 1, padding: 1, flexDirection: "column", gap: 1 }}
    >
      {children}
    </box>
  );
}

export function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <box
      title={label}
      titleColor={theme.dim}
      border
      borderColor={theme.border}
      backgroundColor={theme.panel}
      style={{ flexGrow: 1, flexShrink: 1, minWidth: 14, paddingLeft: 1, paddingRight: 1 }}
    >
      <text fg={theme.cyan}>{value}</text>
      {hint ? <text fg={theme.dim}>{hint}</text> : null}
    </box>
  );
}

function blocks(width: number, filled: number, color: string) {
  const on = Math.max(0, Math.min(width, filled));
  const off = width - on;
  return (
    <text>
      {on > 0 ? <span fg={color}>{"█".repeat(on)}</span> : null}
      {off > 0 ? <span fg={theme.track}>{"░".repeat(off)}</span> : null}
    </text>
  );
}

export function HBars({
  rows,
  max,
  format = (n: number) => String(n),
  width = 18,
}: {
  rows: BarRow[];
  max?: number;
  format?: (n: number) => string;
  width?: number;
}) {
  const peak = Math.max(0, ...rows.map((row) => row.value));
  const cap = max ?? (peak > 0 ? peak : 1);
  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((row, index) => {
        const color = row.dim ? theme.red : theme.cyan;
        const filled = row.value <= 0 ? 0 : Math.max(1, Math.round((row.value / cap) * width));
        const label = row.label.length > 10 ? row.label.slice(0, 10) : row.label.padEnd(10, " ");
        return (
          <box key={`${row.label}-${index}`} style={{ flexDirection: "row", height: 1, gap: 1 }}>
            <text fg={row.dim ? theme.red : theme.text}>{label}</text>
            {blocks(width, filled, color)}
            <text fg={theme.dim}>{format(row.value)}</text>
          </box>
        );
      })}
    </box>
  );
}

export function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      {blocks(24, Math.round(pct * 24), theme.amber)}
      <text fg={theme.amber}>{label}</text>
    </box>
  );
}

function legend(slices: Slice[]) {
  return (
    <text>
      {slices.map((slice) => (
        <span key={slice.label} fg={slice.color}>{`${slice.label}  `}</span>
      ))}
    </text>
  );
}

function colorAt(slices: Slice[], frac: number) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  if (total <= 0) return theme.track;
  let cursor = 0;
  for (const slice of slices) {
    cursor += Math.max(0, slice.value) / total;
    if (frac <= cursor) return slice.color;
  }
  return slices[slices.length - 1]?.color ?? theme.track;
}

export function Proportion({ slices, mode }: { slices: Slice[]; mode: "ring" | "bar" }) {
  if (mode === "bar") {
    const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0) || 1;
    const width = 28;
    let used = 0;
    const parts = slices.map((slice, index) => {
      const span =
        index === slices.length - 1
          ? width - used
          : Math.round((Math.max(0, slice.value) / total) * width);
      used += span;
      return { ...slice, span: Math.max(0, span) };
    });
    return (
      <box style={{ flexDirection: "column", gap: 1 }}>
        <text>
          {parts.map((part) =>
            part.span > 0 ? (
              <span key={part.label} fg={part.color}>{"█".repeat(part.span)}</span>
            ) : null,
          )}
        </text>
        {legend(slices)}
      </box>
    );
  }

  const size = 9;
  const center = (size - 1) / 2;
  const outer = size / 2;
  const inner = outer - 1.8;
  const rows: Array<Array<string | null>> = [];
  for (let y = 0; y < size; y++) {
    const row: Array<string | null> = [];
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);
      if (dist > outer || dist < inner) {
        row.push(null);
        continue;
      }
      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += Math.PI * 2;
      row.push(colorAt(slices, angle / (Math.PI * 2)));
    }
    rows.push(row);
  }

  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((row, y) => (
        <text key={y}>
          {row.map((color, x) =>
            color ? <span key={x} fg={color}>{"█"}</span> : <span key={x}>{" "}</span>,
          )}
        </text>
      ))}
      {legend(slices)}
    </box>
  );
}
