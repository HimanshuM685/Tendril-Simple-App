import { Gauge, HBars, Metric, Panel, Proportion, type Slice } from "./charts.js";
import { hours, num, usd } from "./format.js";
import { theme } from "./theme.js";
import { DEFAULT_PAYLOAD, LOCKED, type NodeInfo, type View } from "./types.js";

function mixSlices(view: View): Slice[] {
  const stats = view.wallet?.stats;
  return [
    { label: "spent", value: num(stats?.totalSpentAtomic), color: theme.amber },
    { label: "earned", value: num(stats?.totalEarnedAtomic), color: theme.green },
    { label: "balance", value: num(view.balance), color: theme.cyan },
  ];
}

export function Overview({
  view,
  wide,
  short,
  gauge,
}: {
  view: View;
  wide: boolean;
  short: boolean;
  gauge: { value: number; max: number; label: string };
}) {
  const stats = view.wallet?.stats;
  const mix = short ? "none" : wide ? "ring" : "bar";
  const hero = view.balance == null ? "--" : (num(view.balance) / 1e6).toFixed(2);
  const nodes = view.nodes.slice(0, 6).map((node) => ({
    label: node.label || node.id,
    value: node.pricePerHourUsd,
    dim: Boolean(node.payoutBlocked),
  }));

  return (
    <box style={{ flexGrow: 1, flexDirection: "column", gap: 1 }}>
      <box style={{ flexDirection: wide ? "row" : "column", gap: 1, flexShrink: 1 }}>
        <Panel title="Balance">
          {wide && !short ? <ascii-font text={hero} font="tiny" color={theme.cyan} /> : null}
          <text fg={theme.cyan}>{view.balance == null ? "balance hidden" : usd(view.balance)}</text>
        </Panel>
        {mix === "ring" ? (
          <Panel title="Mix">
            <Proportion slices={mixSlices(view)} mode="ring" />
          </Panel>
        ) : null}
        {mix === "bar" ? (
          <Panel title="Split">
            <Proportion slices={mixSlices(view)} mode="bar" />
          </Panel>
        ) : null}
        <Panel title="Lease">
          {view.lease ? (
            <box style={{ flexDirection: "column", gap: 1 }}>
              <text fg={theme.text}>{view.lease.leaseId}</text>
              <Gauge value={gauge.value} max={gauge.max} label={gauge.label} />
            </box>
          ) : (
            <text fg={theme.dim}>no session</text>
          )}
        </Panel>
      </box>
      <box style={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
        <Metric label="Spent" value={stats ? usd(stats.totalSpentAtomic) : "—"} />
        <Metric label="Topped up" value={stats ? usd(stats.totalToppedUpAtomic) : "—"} />
        <Metric label="Earned" value={stats ? usd(stats.totalEarnedAtomic) : "—"} />
        <Metric label="Leases" value={stats ? String(stats.leaseCount) : "—"} />
        <Metric label="Runtime" value={stats ? hours(stats.totalLeaseSeconds) : "—"} />
      </box>
      <Panel title="$ / hour">
        {nodes.length ? (
          <HBars rows={nodes} format={(n) => `$${n}`} />
        ) : (
          <text fg={theme.dim}>no nodes online</text>
        )}
      </Panel>
    </box>
  );
}

export function Market({
  view,
  wide,
  selected,
  focused,
  onChange,
  onAsk,
}: {
  view: View;
  wide: boolean;
  selected: number;
  focused: boolean;
  onChange: (index: number) => void;
  onAsk: (index: number) => void;
}) {
  const nodes = view.nodes;
  const node = nodes[selected];
  const maxCpu = Math.max(1, ...nodes.map((item) => item.cpuCores));
  const maxRam = Math.max(1, ...nodes.map((item) => item.ramMb));
  return (
    <box style={{ flexGrow: 1, flexDirection: wide ? "row" : "column", gap: 1 }}>
      <Panel title="Nodes" grow={2}>
        {nodes.length === 0 ? (
          <text fg={theme.dim}>no nodes online</text>
        ) : (
          <select
            focused={focused}
            showDescription={false}
            selectedIndex={selected}
            backgroundColor={theme.panel}
            textColor={theme.text}
            focusedBackgroundColor={theme.panel}
            focusedTextColor={theme.cyan}
            selectedBackgroundColor="#173d24"
            selectedTextColor={theme.cyan}
            descriptionColor={theme.dim}
            selectedDescriptionColor={theme.amber}
            style={{ flexGrow: 1 }}
            options={nodes.map((item) => ({
              name: nodeLine(item),
              description: item.label || item.gpu || "",
              value: item.id,
            }))}
            onChange={(index) => onChange(index)}
            onSelect={(index) => onAsk(index)}
          />
        )}
        {view.hasPay ? (
          <text fg={theme.dim}>enter rents the highlighted node</text>
        ) : (
          <text fg={theme.amber}>{LOCKED}</text>
        )}
      </Panel>
      <box style={{ flexGrow: 1, flexDirection: "column", gap: 1 }}>
        <Panel title="$ / hour">
          <HBars
            rows={nodes.map((item) => ({
              label: item.label || item.id,
              value: item.pricePerHourUsd,
              dim: Boolean(item.payoutBlocked),
            }))}
            format={(n) => `$${n}`}
          />
        </Panel>
        <Panel title="Selected">
          {node ? (
            <box style={{ flexDirection: "column", gap: 1 }}>
              <text fg={theme.text}>{node.gpu ? `${node.id}  ${node.gpu}` : node.id}</text>
              <HBars rows={[{ label: "cpu", value: node.cpuCores }]} max={maxCpu} />
              <HBars rows={[{ label: "ram", value: node.ramMb }]} max={maxRam} format={(n) => `${n} MB`} />
              {node.payoutBlocked ? <text fg={theme.red}>payout blocked</text> : null}
            </box>
          ) : (
            <text fg={theme.dim}>none</text>
          )}
        </Panel>
      </box>
    </box>
  );
}

function nodeLine(node: NodeInfo) {
  return (
    `${node.id}  $${node.pricePerHourUsd}/h  ${node.cpuCores} cpu  ${node.ramMb} MB` +
    `${node.gpu ? `  ${node.gpu}` : ""}` +
    `${node.label ? `  ${node.label}` : ""}` +
    `${node.payoutBlocked ? "  blocked" : ""}`
  );
}

export function LeaseScreen({
  view,
  gauge,
}: {
  view: View;
  gauge: { value: number; max: number; label: string };
}) {
  const lease = view.lease;
  const seen = view.leaseView;
  if (!lease && !view.lastBill) {
    return (
      <Panel title="Lease">
        <text fg={theme.dim}>no session</text>
      </Panel>
    );
  }
  return (
    <box style={{ flexGrow: 1, flexDirection: "column", gap: 1 }}>
      <Panel title="Session">
        {lease ? (
          <box style={{ flexDirection: "column", gap: 1 }}>
            <text fg={theme.text}>{`${seen?.status ?? "open"}  ${lease.leaseId}`}</text>
            <Gauge value={gauge.value} max={gauge.max} label={gauge.label} />
            {lease.ssh?.command ? (
              <text fg={theme.dim} wrapMode="word">{`ssh  ${lease.ssh.command}`}</text>
            ) : null}
            {lease.ssh?.authMethod === "password" && lease.ssh.password ? (
              <text fg={theme.amber}>{`password  ${lease.ssh.password}`}</text>
            ) : null}
            {view.sshWarning ? <text fg={theme.amber}>{view.sshWarning}</text> : null}
            <text fg={theme.dim}>r releases the meter</text>
          </box>
        ) : (
          <text fg={theme.dim}>no session</text>
        )}
      </Panel>
      {view.lastBill ? (
        <Panel title="Last bill">
          <text fg={theme.text}>
            {`${view.lastBill.usedSeconds}s used, charged ${usd(view.lastBill.chargedAtomic)}`}
          </text>
          <text fg={theme.cyan}>{`balance ${usd(view.lastBill.balance)}`}</text>
        </Panel>
      ) : null}
    </box>
  );
}

export function Wallet({
  view,
  amount,
  field,
  onAmount,
  onSubmit,
}: {
  view: View;
  amount: string;
  field: boolean;
  onAmount: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const stats = view.wallet?.stats;
  const wallet = view.wallet;
  return (
    <box style={{ flexGrow: 1, flexDirection: "column", gap: 1 }}>
      <Panel title="Lifetime">
        {stats ? (
          <HBars
            rows={[
              { label: "topped up", value: num(stats.totalToppedUpAtomic) },
              { label: "spent", value: num(stats.totalSpentAtomic) },
              { label: "earned", value: num(stats.totalEarnedAtomic) },
            ]}
            format={(n) => usd(n)}
          />
        ) : (
          <text fg={theme.dim}>balance hidden</text>
        )}
      </Panel>
      <scrollbox title="History" titleColor={theme.dim} border borderColor={theme.border} backgroundColor={theme.panel} style={{ height: 6 }}>
        <text fg={theme.text}>
          {wallet
            ? `${wallet.topups.length} topups, ${wallet.charges.length} charges, ${wallet.payouts.length} payouts`
            : "no history"}
        </text>
        <text fg={theme.dim}>{wallet ? `${stats?.payoutCount ?? 0} payouts settled` : ""}</text>
      </scrollbox>
      {view.hasPay ? (
        <Panel title="Top up">
          <input
            value={amount}
            placeholder="0.5"
            focused={field}
            backgroundColor={theme.bg}
            textColor={theme.cyan}
            focusedTextColor={theme.cyan}
            placeholderColor={theme.dim}
            onInput={onAmount}
            onSubmit={(value) => {
              if (typeof value === "string") onSubmit(value);
            }}
          />
          <text fg={theme.dim}>USDC, or atomic units with a u suffix. enter submits.</text>
        </Panel>
      ) : (
        <Panel title="Top up">
          <text fg={theme.amber}>{LOCKED}</text>
        </Panel>
      )}
    </box>
  );
}

export function Run({
  view,
  payload,
  field,
  onPayload,
  onSubmit,
}: {
  view: View;
  payload: string;
  field: boolean;
  onPayload: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const job = view.lastRun;
  return (
    <box style={{ flexGrow: 1, flexDirection: "column", gap: 1 }}>
      <text fg={view.lease ? theme.cyan : theme.dim}>
        {view.lease ? `lease ${view.lease.leaseId}` : "one-shot — no active lease"}
      </text>
      {view.hasPay ? (
        <Panel title="Payload">
          <input
            value={payload}
            placeholder={DEFAULT_PAYLOAD}
            focused={field}
            backgroundColor={theme.bg}
            textColor={theme.cyan}
            focusedTextColor={theme.cyan}
            placeholderColor={theme.dim}
            onInput={onPayload}
            onSubmit={(value) => {
              if (typeof value === "string") onSubmit(value);
            }}
          />
          <text fg={theme.dim}>enter runs this payload</text>
        </Panel>
      ) : (
        <Panel title="Payload">
          <text fg={theme.amber}>{LOCKED}</text>
        </Panel>
      )}
      {job ? (
        <Panel title="Result">
          <text fg={job.ok ? theme.green : theme.red}>{`job ${job.jobId ?? "?"} ok=${String(job.ok)}`}</text>
          <text fg={theme.text} wrapMode="word">{String(job.result ?? "")}</text>
          {job.execution ? (
            <box style={{ flexDirection: "row", gap: 1 }}>
              <Metric label="Seconds" value={String(job.execution.seconds ?? 0)} />
              <Metric label="Cost" value={usd(job.execution.costAtomic ?? 0)} />
            </box>
          ) : null}
        </Panel>
      ) : null}
    </box>
  );
}

export function Dialog({
  title,
  body,
  hint = "Y confirms, N cancels. Enter confirms.",
}: {
  title: string;
  body: string;
  hint?: string;
}) {
  return (
    <Panel title={title}>
      <text fg={theme.text}>{body}</text>
      <text fg={theme.dim}>{hint}</text>
    </Panel>
  );
}
