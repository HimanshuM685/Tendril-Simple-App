// Tendril renter. Paid actions return their transaction link; the readline
// menu prints it, the full-screen dashboard renders it.
//   node src/index.mjs           -> readline menu (piped or direct)
//   node src/index.mjs keygen    -> print a fresh address + AVM_PRIVATE_KEY
//   node src/index.mjs selftest  -> assert the pure helpers
//   npm start                    -> dashboard on a TTY, menu otherwise
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import algosdk from "algosdk";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

const API = (process.env.REGISTRY_URL ?? "http://localhost:4000").replace(/\/$/, "");

const GENESIS = {
  "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=": "testnet",
  "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=": "mainnet",
};

export const usd = (atomic) => `${(Number(atomic) / 1e6).toFixed(6)} USDC`;

/** CAIP-2 id -> a Lora explorer link for one transaction. */
export const txLink = (txid, caip2) =>
  `https://lora.algokit.io/${GENESIS[String(caip2).split(":")[1]] ?? "testnet"}/transaction/${txid}`;

export function networkName(caip2) {
  if (!caip2) return "";
  return GENESIS[String(caip2).split(":")[1]] ?? String(caip2);
}

/** "0.5" | "500000u" -> atomic units. Bare decimals are USDC, a `u` suffix is already atomic. */
export function toAtomic(input) {
  const s = String(input).trim();
  if (/^\d+u$/.test(s)) return BigInt(s.slice(0, -1));
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`not a USDC amount: ${s}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 1000000n + BigInt(frac.padEnd(6, "0"));
}

export function formatError(err) {
  const quoted = err.body?.accepts?.[0]?.amount;
  return quoted ? `${err.message} quoted: ${usd(quoted)}` : err.message;
}

async function json(res) {
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { error: body.slice(0, 200) };
  }
  if (!res.ok) {
    const e = new Error(
      `${res.status} ${parsed.error ?? "request failed"}${parsed.detail ? `: ${parsed.detail}` : ""}`,
    );
    e.body = parsed;
    throw e;
  }
  return parsed;
}

export function defaultSshKey() {
  try {
    return readFileSync(`${homedir()}/.ssh/id_ed25519.pub`, "utf8").trim();
  } catch {
    return null;
  }
}

function makeSigner(state) {
  const raw = process.env.AVM_PRIVATE_KEY;
  if (!raw) return null;
  const sk = new Uint8Array(Buffer.from(raw, "base64"));
  if (sk.length !== 64) throw new Error(`AVM_PRIVATE_KEY must decode to 64 bytes, got ${sk.length}`);
  const address = algosdk.encodeAddress(sk.slice(32));
  state.sk = sk;
  return {
    address,
    // Sign only the indexes asked for. The fee-payer txn stays unsigned on purpose —
    // the facilitator signs it and pays the network fee, so this account needs no ALGO.
    async signTransactions(txns, indexes) {
      const wanted = indexes ?? txns.map((_, i) => i);
      return txns.map((b, i) =>
        wanted.includes(i) ? algosdk.decodeUnsignedTransaction(b).signTxn(sk) : null,
      );
    },
  };
}

/**
 * One registry session. Methods return data; callers print or render it.
 * `paid` resolves `{ body, txUrl }` — txUrl is null on a payment replay.
 */
export function createSession() {
  const state = {
    lease: null,
    leaseView: null,
    openedAt: null,
    balance: null,
    network: null,
    asset: null,
    pay: null,
    address: null,
    sk: null,
    token: null,
    signInError: null,
    nodes: [],
    wallet: null,
    sshWarning: null,
  };

  function snapshot() {
    return {
      api: API,
      address: state.address,
      balance: state.balance,
      network: state.network,
      networkName: networkName(state.network),
      asset: state.asset,
      hasPay: Boolean(state.pay),
      signInError: state.signInError,
      lease: state.lease,
      leaseView: state.leaseView,
      openedAt: state.openedAt,
      nodes: state.nodes,
      wallet: state.wallet,
      sshWarning: state.sshWarning,
    };
  }

  async function paid(url, init) {
    if (!state.pay) throw new Error("needs AVM_PRIVATE_KEY in .env — run `npm run keygen`");
    const res = await state.pay(url, init);
    const header = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
    const body = await json(res);
    const txid =
      body.payment?.txid ??
      (header ? JSON.parse(Buffer.from(header, "base64").toString()).transaction : null);
    return { body, txUrl: txid ? txLink(txid, state.network) : null };
  }

  /**
   * Trade a signed nonce for a 7-day session token. The signature is over a 0-ALGO
   * self-payment that is verified and discarded, never broadcast — it costs nothing
   * and needs no balance. A session only buys the right to read your own history.
   */
  async function signIn() {
    if (state.token) return state.token;
    if (!state.sk) throw new Error("no AVM_PRIVATE_KEY");
    const { nonce } = await fetch(
      `${API}/auth/wallet-nonce?address=${state.address}`,
    ).then(json);
    const genesisHash = state.network.split(":")[1];
    const suggestedParams = {
      fee: 1000,
      minFee: 1000,
      firstValid: 1,
      lastValid: 1000,
      genesisID: `${GENESIS[genesisHash] ?? "testnet"}-v1.0`,
      genesisHash: algosdk.base64ToBytes(genesisHash),
    };
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: state.address,
      receiver: state.address,
      amount: 0,
      note: new TextEncoder().encode(nonce),
      suggestedParams,
    });
    const r = await fetch(`${API}/auth/wallet-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: state.address,
        nonce,
        payment: Buffer.from(txn.signTxn(state.sk)).toString("base64"),
      }),
    }).then(json);
    state.token = r.token;
    state.balance = r.balanceAtomic;
    return r.token;
  }

  return {
    snapshot,
    sshPubKey: defaultSshKey,

    async boot() {
      const signer = makeSigner(state);
      const { network, asset } = await fetch(`${API}/platform`).then(json);
      state.network = network;
      state.asset = asset;
      if (signer) {
        state.address = signer.address;
        state.pay = wrapFetchWithPayment(
          fetch,
          new x402Client().register(network, new ExactAvmScheme(signer)),
        );
        try {
          await signIn();
        } catch (e) {
          state.signInError = e.message;
        }
      }
      return snapshot();
    },

    async loadWallet() {
      await signIn();
      const w = await fetch(`${API}/wallet`, {
        headers: { authorization: `Bearer ${state.token}` },
      }).then(json);
      state.balance = w.balanceAtomic;
      state.wallet = w;
      if (!state.address) state.address = w.address;
      return w;
    },

    async listNodes() {
      const { nodes } = await fetch(`${API}/explorer`).then(json);
      const online = nodes.filter((n) => n.status === "online");
      online.sort((a, b) => a.pricePerHourUsd - b.pricePerHourUsd);
      state.nodes = online;
      return online;
    },

    async topup(input) {
      const atomic = toAtomic(String(input).trim() || "0.5");
      const { body, txUrl } = await paid(`${API}/topup?amount=${atomic}`, { method: "POST" });
      state.balance = body.balance;
      return { ...body, txUrl };
    },

    async rent(node) {
      const sshPubKey = defaultSshKey();
      state.sshWarning = sshPubKey
        ? null
        : "no ~/.ssh/id_ed25519.pub — SSH login impossible, run still works";
      const { body, txUrl } = await paid(`${API}/x402/rent?nodeId=${node.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sshPubKey ? { sshPubKey } : {}),
      });
      state.lease = body;
      state.leaseView = null;
      state.openedAt = Date.now();
      state.balance = body.billing?.creditAtomic ?? state.balance;
      return { lease: body, txUrl, sshWarning: state.sshWarning, nodeId: node.id };
    },

    async run(payload) {
      const headers = { "content-type": "application/json" };
      const oneShot = !state.lease;
      if (state.lease) headers.authorization = `Bearer ${state.lease.leaseToken}`;
      const { body, txUrl } = await paid(`${API}/x402/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({ payload }),
      });
      if (body.execution) state.balance = body.execution.balance;
      return { ...body, txUrl, oneShot };
    },

    async status() {
      if (!state.lease) throw new Error("no active lease");
      const { lease } = await fetch(`${API}/lease/${state.lease.leaseId}`, {
        headers: { authorization: `Bearer ${state.lease.leaseToken}` },
      }).then(json);
      state.leaseView = lease;
      return lease;
    },

    async release() {
      if (!state.lease) throw new Error("no active lease");
      const bill = await fetch(`${API}/x402/leases/${state.lease.leaseId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${state.lease.leaseToken}` },
      }).then(json);
      state.balance = bill.balance;
      state.lease = null;
      state.leaseView = null;
      state.openedAt = null;
      return bill;
    },
  };
}

function printTx(txUrl) {
  if (txUrl) console.log(`  tx  ${txUrl}`);
  else console.log("  tx  (none — replay of an earlier payment, nothing new settled)");
}

function printWallet(w) {
  const s = w.stats;
  const hours = (sec) => `${(sec / 3600).toFixed(2)}h`;
  console.log(`  ${w.address}`);
  console.log(`  balance     ${usd(w.balanceAtomic)}`);
  console.log(`  spent       ${usd(s.totalSpentAtomic)}   topped up  ${usd(s.totalToppedUpAtomic)}`);
  console.log(`  earned      ${usd(s.totalEarnedAtomic)}   payouts    ${s.payoutCount}`);
  console.log(`  leases      ${s.leaseCount}   runtime ${hours(s.totalLeaseSeconds)}`);
  console.log(
    `  history     ${w.topups.length} topups, ${w.charges.length} charges, ${w.payouts.length} payouts`,
  );
}

function printNodes(online) {
  if (!online.length) {
    console.log("  no nodes online");
    return;
  }
  online.forEach((n, i) => {
    console.log(
      `  ${i + 1}. ${n.id}  $${n.pricePerHourUsd}/h  ${n.cpuCores} cpu  ${n.ramMb} MB` +
        `${n.gpu ? `  ${n.gpu}` : ""}${n.label ? `  "${n.label}"` : ""}` +
        `${n.payoutBlocked ? "  [payout blocked]" : ""}`,
    );
  });
}

function keygen() {
  const acct = algosdk.generateAccount();
  console.log(`Address:         ${acct.addr}`);
  console.log(`AVM_PRIVATE_KEY=${Buffer.from(acct.sk).toString("base64")}`);
  console.log("\nPut that line in .env (never .env.example — that one is committed).");
  console.log("Fund it: opt into the USDC ASA, then the testnet dispenser. No ALGO needed.");
}

function selftest() {
  console.assert(toAtomic("1") === 1000000n, "1 USDC");
  console.assert(toAtomic("0.5") === 500000n, "0.5 USDC");
  console.assert(toAtomic("0.000001") === 1n, "one atomic unit");
  console.assert(toAtomic("500000u") === 500000n, "u suffix passes through");
  for (const bad of ["", "abc", "-1", "1.0000001", "1e6"]) {
    let threw = false;
    try {
      toAtomic(bad);
    } catch {
      threw = true;
    }
    console.assert(threw, `should reject ${JSON.stringify(bad)}`);
  }
  console.assert(
    txLink("ABC", "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=") ===
      "https://lora.algokit.io/testnet/transaction/ABC",
    "testnet link",
  );
  console.assert(
    txLink("ABC", "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=").includes("/mainnet/"),
    "mainnet link",
  );
  console.log("selftest ok");
}

/** Readline menu. Used when stdin is not a TTY, and by `node src/index.mjs`. */
export async function startMenu() {
  const session = createSession();
  const snap = await session.boot();

  console.log(`\nTendril @ ${snap.api}`);
  console.log(
    `${snap.asset.symbol} (ASA ${snap.asset.id}) on ${snap.networkName}`,
  );
  console.log(snap.hasPay ? `payer ${snap.address}` : "no AVM_PRIVATE_KEY — free actions only");
  if (snap.signInError) console.log(`sign-in failed (${snap.signInError}) — balance hidden`);

  const wallet = async () => {
    printWallet(await session.loadWallet());
  };
  const listNodes = async () => {
    const online = await session.listNodes();
    printNodes(online);
    return online;
  };
  const topup = async (rl) => {
    const answer = (await rl.question("  amount in USDC [0.5]: ")).trim() || "0.5";
    const r = await session.topup(answer);
    printTx(r.txUrl);
    console.log(`  credited ${usd(r.credited)} — balance ${usd(r.balance)}`);
  };
  const rent = async (rl) => {
    const nodes = await listNodes();
    if (!nodes.length) return;
    const pick = (await rl.question("  node number [1]: ")).trim() || "1";
    const node = nodes[Number(pick) - 1];
    if (!node) throw new Error(`no node ${pick}`);
    if (!session.sshPubKey()) {
      console.log("  ! no ~/.ssh/id_ed25519.pub — SSH login impossible, run still works");
    }
    const r = await session.rent(node);
    printTx(r.txUrl);
    console.log(`  lease ${r.lease.leaseId} on ${node.id}, funded until ${r.lease.fundedUntil}`);
    console.log(`  ssh  ${r.lease.ssh.command}`);
    if (r.lease.ssh.authMethod === "password") console.log(`  password: ${r.lease.ssh.password}`);
  };
  const run = async (rl) => {
    const payload =
      (await rl.question("  payload [print(sum(range(100)))]: ")).trim() || "print(sum(range(100)))";
    if (!session.snapshot().lease) {
      console.log("  (no active lease — executing one-shot run)");
    }
    const r = await session.run(payload);
    printTx(r.txUrl);
    console.log(`  job ${r.jobId} ok=${r.ok}`);
    console.log(String(r.result).replace(/^/gm, "  | "));
    if (r.execution) {
      console.log(
        `  node ${r.execution.nodeId}, ${r.execution.seconds}s, cost ${usd(r.execution.costAtomic)}`,
      );
    }
  };
  const status = async () => {
    const lease = await session.status();
    console.log(`  ${lease.status}, rate ${usd(lease.rateAtomicPerHour)}/h`);
    console.log(`  expires ${new Date(lease.expiresAt).toISOString()}`);
  };
  const release = async () => {
    const bill = await session.release();
    console.log(`  ${bill.usedSeconds}s used, charged ${usd(bill.chargedAtomic)}`);
    console.log(`  balance ${usd(bill.balance)}`);
  };

  const MENU = [
    ["0", "wallet", "balance and lifetime totals", wallet, true],
    ["1", "market", "list online nodes", listNodes, false],
    ["2", "topup", "buy credit", topup, true],
    ["3", "rent", "open a session", rent, true],
    ["4", "run", "execute a job (lease or one-shot)", run, true],
    ["5", "status", "poll the lease", status, false],
    ["6", "release", "stop the meter and bill", release, false],
  ];

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const view = session.snapshot();
    console.log("");
    for (const [key, name, help, , needsKey] of MENU) {
      const locked = needsKey && !view.hasPay ? "  (needs AVM_PRIVATE_KEY)" : "";
      console.log(`  ${key}  ${name.padEnd(8)} ${help}${locked}`);
    }
    console.log("  q  quit");
    if (view.lease) console.log(`\n  lease ${view.lease.leaseId} active`);
    if (view.balance != null) console.log(`  balance ${usd(view.balance)}`);

    let choice;
    try {
      choice = (await rl.question("\n> ")).trim().toLowerCase();
    } catch {
      break;
    }
    if (choice === "q" || choice === "quit" || choice === "") break;
    const item = MENU.find(([key, name]) => key === choice || name === choice);
    if (!item) {
      console.log("  ?");
      continue;
    }
    const [, , , fn, needsKey] = item;
    if (needsKey && !session.snapshot().hasPay) {
      console.log("  needs AVM_PRIVATE_KEY in .env — run `npm run keygen`");
      continue;
    }
    try {
      await fn(rl);
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      if (err.body?.accepts) console.log(`    quoted: ${usd(err.body.accepts[0].amount)}`);
    }
  }

  if (session.snapshot().lease) {
    let yes = "y";
    try {
      yes = (
        await rl.question(`release ${session.snapshot().lease.leaseId} before quitting? [Y/n] `)
      ).trim();
    } catch {
      /* stdin gone — release anyway */
    }
    if (!/^n/i.test(yes)) {
      try {
        await release();
      } catch (e) {
        console.log(`  ✗ ${e.message}`);
      }
    }
  }
  rl.close();
}

export async function dispatch(cmd = process.argv[2]) {
  if (cmd === "keygen") keygen();
  else if (cmd === "selftest") selftest();
  else await startMenu();
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  try {
    await dispatch();
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
