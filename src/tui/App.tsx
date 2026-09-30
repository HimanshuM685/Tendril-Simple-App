import { useEffect, useState } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { formatError } from "../index.mjs";
import { clip, leaseGauge, shortAddr, usd } from "./format.js";
import { Dialog, LeaseScreen, Market, Overview, Run, Wallet } from "./screens.js";
import { theme } from "./theme.js";
import {
  DEFAULT_PAYLOAD,
  LOCKED,
  emptyView,
  type TendrilSession,
  type View,
} from "./types.js";

const SECTIONS = [
  ["1", "overview", "Overview"],
  ["2", "market", "Market"],
  ["3", "lease", "Lease"],
  ["4", "wallet", "Wallet"],
  ["5", "run", "Run"],
] as const;

type Section = (typeof SECTIONS)[number][1];
type DialogKind = "quit" | "rent" | "release" | null;
type Field = "amount" | "payload" | null;

export function App({
  session,
  initial,
}: {
  session?: TendrilSession;
  initial?: View;
}) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [view, setView] = useState<View>(initial ?? emptyView());
  const [section, setSection] = useState<Section>("overview");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [field, setField] = useState<Field>(null);
  const [selected, setSelected] = useState(0);
  const [amount, setAmount] = useState("0.5");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [now, setNow] = useState(() => Date.now());

  const wide = width >= 100;
  const short = height < 30;
  const gauge = leaseGauge(view, now);

  useEffect(() => {
    if (!session) return;
    let cancel = false;
    (async () => {
      try {
        await session.boot();
      } catch (err) {
        if (!cancel) {
          setView((prev) => ({
            ...prev,
            ...session.snapshot(),
            loading: false,
            error: formatError(err),
          }));
        }
        return;
      }
      let error: string | null = null;
      try {
        await session.listNodes();
      } catch (err) {
        error = formatError(err);
      }
      if (session.snapshot().hasPay) {
        try {
          await session.loadWallet();
        } catch (err) {
          error = error ?? formatError(err);
        }
      }
      if (!cancel) {
        setView((prev) => ({
          ...prev,
          ...session.snapshot(),
          loading: false,
          error,
        }));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session || section !== "lease" || !view.lease) return;
    let stop = false;
    const tick = async () => {
      try {
        await session.status();
        if (!stop) setView((prev) => ({ ...prev, ...session.snapshot() }));
      } catch (err) {
        if (!stop) setView((prev) => ({ ...prev, error: formatError(err) }));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [session, section, view.lease?.leaseId]);

  useEffect(() => {
    if (!view.lease) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view.lease?.leaseId]);

  function leave() {
    try {
      renderer.destroy();
    } catch {
      /* renderer already torn down */
    }
    if (process.env.NODE_TEST_CONTEXT) return;
    process.exit(0);
  }

  async function doQuit(releaseFirst: boolean) {
    if (releaseFirst && session && view.lease) {
      try {
        await session.release();
      } catch (err) {
        setView((prev) => ({ ...prev, error: formatError(err) }));
      }
    }
    leave();
  }

  async function doRent() {
    const node = view.nodes[selected];
    if (!session || !node) return;
    if (!view.hasPay) {
      setDialog(null);
      setView((prev) => ({ ...prev, error: LOCKED }));
      return;
    }
    setDialog(null);
    setView((prev) => ({ ...prev, pending: true, error: null }));
    try {
      const rented = await session.rent(node);
      setSection("lease");
      setView((prev) => ({
        ...prev,
        ...session.snapshot(),
        pending: false,
        lastTx: rented.txUrl,
        notice: `lease ${rented.lease.leaseId}`,
        error: null,
      }));
    } catch (err) {
      setView((prev) => ({ ...prev, pending: false, error: formatError(err) }));
    }
  }

  async function doRelease() {
    if (!session || !view.lease) return;
    setDialog(null);
    setView((prev) => ({ ...prev, pending: true, error: null }));
    try {
      const bill = await session.release();
      setView((prev) => ({
        ...prev,
        ...session.snapshot(),
        pending: false,
        lastBill: bill,
        notice: `${bill.usedSeconds}s used, charged ${usd(bill.chargedAtomic)}`,
        error: null,
      }));
    } catch (err) {
      setView((prev) => ({ ...prev, pending: false, error: formatError(err) }));
    }
  }

  async function doTopup(raw: string) {
    if (!session || !view.hasPay) {
      setView((prev) => ({ ...prev, error: LOCKED }));
      return;
    }
    setField(null);
    setView((prev) => ({ ...prev, pending: true, error: null }));
    try {
      const topped = await session.topup(raw.trim() || "0.5");
      try {
        await session.loadWallet();
      } catch {
        /* balance already updated from the topup response */
      }
      setView((prev) => ({
        ...prev,
        ...session.snapshot(),
        pending: false,
        lastTx: topped.txUrl,
        notice: `credited ${usd(topped.credited)}`,
        error: null,
      }));
    } catch (err) {
      setView((prev) => ({ ...prev, pending: false, error: formatError(err) }));
    }
  }

  async function doRun(raw: string) {
    if (!session || !view.hasPay) {
      setView((prev) => ({ ...prev, error: LOCKED }));
      return;
    }
    const body = raw.trim() || DEFAULT_PAYLOAD;
    setField(null);
    setView((prev) => ({ ...prev, pending: true, error: null, notice: null }));
    try {
      const ran = await session.run(body);
      setView((prev) => ({
        ...prev,
        ...session.snapshot(),
        pending: false,
        lastTx: ran.txUrl,
        lastRun: ran,
        notice: ran.oneShot ? "one-shot run" : `job ${ran.jobId ?? ""}`,
        error: null,
      }));
    } catch (err) {
      setView((prev) => ({ ...prev, pending: false, error: formatError(err) }));
    }
  }

  useKeyboard((key) => {
    if (key.eventType === "release" || view.pending) return;
    const name = key.name;

    if (key.ctrl && name === "c") {
      if (dialog === "quit") {
        void doQuit(true);
        return;
      }
      if (view.lease) {
        setField(null);
        setDialog("quit");
        return;
      }
      void doQuit(false);
      return;
    }

    if (dialog === "quit") {
      if (name === "n") {
        void doQuit(false);
        return;
      }
      if (name === "y" || name === "return") {
        void doQuit(true);
        return;
      }
      if (name === "escape") setDialog(null);
      return;
    }

    if (dialog) {
      if (name === "n" || name === "escape") {
        setDialog(null);
        return;
      }
      if (name === "y" || name === "return") {
        if (dialog === "rent") void doRent();
        else if (dialog === "release") void doRelease();
      }
      return;
    }

    if (field) {
      if (name === "escape") setField(null);
      return;
    }

    const next = SECTIONS.find(([hotkey]) => hotkey === name);
    if (next) {
      setSection(next[1]);
      return;
    }
    if (name === "q") {
      if (view.lease) setDialog("quit");
      else void doQuit(false);
      return;
    }
    if (section === "wallet" && view.hasPay && (name === "a" || name === "return")) {
      setField("amount");
      return;
    }
    if (section === "run" && view.hasPay && name === "return") {
      setField("payload");
      return;
    }
    if (section === "lease" && view.lease && name === "r") {
      setDialog("release");
    }
  });

  const asset = view.asset ? `${view.networkName} · ${view.asset.symbol}` : view.networkName || "…";
  const balance = view.balance == null ? "" : usd(view.balance);
  const tx = view.lastTx ? `tx ${clip(view.lastTx, Math.max(16, width - 42))}` : "";
  const hints = dialog === "quit"
    ? "y release   n quit anyway"
    : dialog
    ? "y confirm   n cancel"
    : field
      ? "enter submits   esc back"
      : `1-5 jump   q quit${section === "wallet" && view.hasPay ? "   a amount" : ""}${
          section === "lease" && view.lease ? "   r release" : ""
        }${section === "market" ? "   enter rent" : ""}${section === "run" && view.hasPay ? "   enter run" : ""}   ${
          view.pending ? "working…" : tx
        }`;
  const status =
    view.error ??
    view.notice ??
    (view.signInError ? `sign-in failed (${view.signInError}) — balance hidden` : "");

  let body;
  if (view.loading) {
    body = <text fg={theme.dim}>{view.api ? `connecting ${view.api}` : "connecting…"}</text>;
  } else if (dialog === "quit" && view.lease) {
    body = (
      <Dialog
        title="Quit"
        body={`release ${view.lease.leaseId} before quitting?`}
        hint="Y releases the meter, N quits and leaves it running."
      />
    );
  } else if (dialog === "rent") {
    const node = view.nodes[selected];
    body = (
      <Dialog
        title="Rent"
        body={node ? `open a lease on ${node.id} at $${node.pricePerHourUsd}/h?` : "no node"}
      />
    );
  } else if (dialog === "release" && view.lease) {
    body = <Dialog title="Release" body={`stop ${view.lease.leaseId} and bill the session?`} />;
  } else if (section === "overview") {
    body = <Overview view={view} wide={wide} short={short} gauge={gauge} />;
  } else if (section === "market") {
    body = (
      <Market
        view={view}
        wide={wide}
        selected={Math.min(selected, Math.max(0, view.nodes.length - 1))}
        focused
        onChange={setSelected}
        onAsk={(index) => {
          setSelected(index);
          if (!view.hasPay) setView((prev) => ({ ...prev, error: LOCKED }));
          else setDialog("rent");
        }}
      />
    );
  } else if (section === "lease") {
    body = <LeaseScreen view={view} gauge={gauge} />;
  } else if (section === "wallet") {
    body = (
      <Wallet
        view={view}
        amount={amount}
        field={field === "amount"}
        onAmount={setAmount}
        onSubmit={(value) => void doTopup(value)}
      />
    );
  } else {
    body = (
      <Run
        view={view}
        payload={payload}
        field={field === "payload"}
        onPayload={setPayload}
        onSubmit={(value) => void doRun(value)}
      />
    );
  }

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: theme.bg,
      }}
    >
      <box
        style={{
          height: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text fg={theme.dim}>{`Tendril  ${asset}  ${shortAddr(view.address)}`}</text>
        <text fg={theme.cyan}>{balance}</text>
      </box>
      <box style={{ height: 1, flexDirection: "row", gap: 2, paddingLeft: 1 }}>
        {SECTIONS.map(([hotkey, id, label]) => (
          <text key={id} fg={section === id ? theme.cyan : theme.dim}>
            {section === id ? `▸ ${hotkey} ${label}` : `${hotkey} ${label}`}
          </text>
        ))}
      </box>
      <box style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}>{body}</box>
      <box style={{ height: 2, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
        <text fg={theme.dim}>{hints}</text>
        <text fg={view.error ? theme.red : theme.dim}>{status}</text>
      </box>
    </box>
  );
}
