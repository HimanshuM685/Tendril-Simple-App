// Menu-driven Tendril renter. Every paid action prints its transaction link.
//   node src/index.mjs           -> the menu
//   node src/index.mjs keygen    -> print a fresh address + AVM_PRIVATE_KEY
//   node src/index.mjs selftest  -> assert the pure helpers
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import algosdk from "algosdk";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

const API = (process.env.REGISTRY_URL ?? "http://localhost:4000").replace(/\/$/, "");

const GENESIS = {
  "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=": "testnet",
  "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=": "mainnet",
};

const usd = (atomic) => `${(Number(atomic) / 1e6).toFixed(6)} USDC`;

/** CAIP-2 id -> a Lora explorer link for one transaction. */
export const txLink = (txid, caip2) =>
  `https://lora.algokit.io/${GENESIS[String(caip2).split(":")[1]] ?? "testnet"}/transaction/${txid}`;

/** "0.5" | "500000u" -> atomic units. Bare decimals are USDC, a `u` suffix is already atomic. */
export function toAtomic(input) {
  const s = String(input).trim();
  if (/^\d+u$/.test(s)) return BigInt(s.slice(0, -1));
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`not a USDC amount: ${s}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 1000000n + BigInt(frac.padEnd(6, "0"));
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

const state = {
  lease: null,
  balance: null,
  network: null,
  asset: null,
  pay: null,
  address: null,
  sk: null,
  token: null,
};

/** Run a paid request, print the tx link off PAYMENT-RESPONSE, return the body. */
async function paid(url, init) {
  const res = await state.pay(url, init);
  const header = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  const body = await json(res);
  const txid =
    body.payment?.txid ??
    (header ? JSON.parse(Buffer.from(header, "base64").toString()).transaction : null);
  if (txid) console.log(`  tx  ${txLink(txid, state.network)}`);
  else console.log("  tx  (none — replay of an earlier payment, nothing new settled)");
  return body;
}

function keygen() {
  const acct = algosdk.generateAccount();
  console.log(`Address:         ${acct.addr}`);
  console.log(`AVM_PRIVATE_KEY=${Buffer.from(acct.sk).toString("base64")}`);
  console.log("\nPut that line in .env (never .env.example — that one is committed).");
  console.log("Fund it: opt into the USDC ASA, then the testnet dispenser. No ALGO needed.");
}

function makeSigner() {
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

function defaultSshKey() {
  try {
    return readFileSync(`${homedir()}/.ssh/id_ed25519.pub`, "utf8").trim();
  } catch {
    return null;
  }
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

// ---- menu actions ----

async function wallet() {
  await signIn();
  const w = await fetch(`${API}/wallet`, {
    headers: { authorization: `Bearer ${state.token}` },
  }).then(json);
  state.balance = w.balanceAtomic;
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

async function listNodes() {
  const { nodes } = await fetch(`${API}/explorer`).then(json);
  const online = nodes.filter((n) => n.status === "online");
  if (!online.length) {
    console.log("  no nodes online");
    return [];
  }
  online.sort((a, b) => a.pricePerHourUsd - b.pricePerHourUsd);
  online.forEach((n, i) => {
    console.log(
      `  ${i + 1}. ${n.id}  $${n.pricePerHourUsd}/h  ${n.cpuCores} cpu  ${n.ramMb} MB` +
        `${n.gpu ? `  ${n.gpu}` : ""}${n.label ? `  "${n.label}"` : ""}` +
        `${n.payoutBlocked ? "  [payout blocked]" : ""}`,
    );
  });
  return online;
}

async function topup(rl) {
  const answer = (await rl.question("  amount in USDC [0.5]: ")).trim() || "0.5";
  const atomic = toAtomic(answer);
  const r = await paid(`${API}/topup?amount=${atomic}`, { method: "POST" });
  state.balance = r.balance;
  console.log(`  credited ${usd(r.credited)} — balance ${usd(r.balance)}`);
}

async function rent(rl) {
  const nodes = await listNodes();
  if (!nodes.length) return;
  const pick = (await rl.question(`  node number [1]: `)).trim() || "1";
  const node = nodes[Number(pick) - 1];
  if (!node) throw new Error(`no node ${pick}`);

  const sshPubKey = defaultSshKey();
  if (!sshPubKey) console.log("  ! no ~/.ssh/id_ed25519.pub — SSH login impossible, run still works");

  const lease = await paid(`${API}/rent/${node.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sshPubKey ? { sshPubKey } : {}),
  });
  state.lease = lease;
  state.balance = lease.billing.creditAtomic;
  console.log(`  lease ${lease.leaseId} on ${node.id}, funded until ${lease.fundedUntil}`);
  console.log(`  ssh  ${lease.ssh.command}`);
  if (lease.ssh.authMethod === "password") console.log(`  password: ${lease.ssh.password}`);
}

async function run(rl) {
  if (!state.lease) throw new Error("no active lease — rent first");
  const payload = (await rl.question("  payload [print(sum(range(100)))]: ")).trim() ||
    "print(sum(range(100)))";
  const r = await paid(`${API}/lease/${state.lease.leaseId}/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.lease.leaseToken}`,
    },
    body: JSON.stringify({ payload }),
  });
  console.log(`  job ${r.jobId} ok=${r.ok}`);
  console.log(String(r.result).replace(/^/gm, "  | "));
}

async function status() {
  if (!state.lease) throw new Error("no active lease");
  const { lease } = await fetch(`${API}/lease/${state.lease.leaseId}`, {
    headers: { authorization: `Bearer ${state.lease.leaseToken}` },
  }).then(json);
  console.log(`  ${lease.status}, rate ${usd(lease.rateAtomicPerHour)}/h`);
  console.log(`  expires ${new Date(lease.expiresAt).toISOString()}`);
}

async function release() {
  if (!state.lease) throw new Error("no active lease");
  // Free endpoint, no payment — nothing to link.
  const bill = await fetch(`${API}/x402/leases/${state.lease.leaseId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${state.lease.leaseToken}` },
  }).then(json);
  state.balance = bill.balance;
  state.lease = null;
  console.log(`  ${bill.usedSeconds}s used, charged ${usd(bill.chargedAtomic)}`);
  console.log(`  balance ${usd(bill.balance)}`);
}

// ---- menu ----

const MENU = [
  ["0", "wallet", "balance and lifetime totals", wallet, true],
  ["1", "market", "list online nodes", listNodes, false],
  ["2", "topup", "buy credit", topup, true],
  ["3", "rent", "open a session", rent, true],
  ["4", "run", "execute a job on the lease", run, true],
  ["5", "status", "poll the lease", status, false],
  ["6", "release", "stop the meter and bill", release, false],
];

async function menu() {
  const signer = makeSigner();
  const { network, asset } = await fetch(`${API}/platform`).then(json);
  state.network = network;
  state.asset = asset;
  if (signer) {
    state.address = signer.address;
    state.pay = wrapFetchWithPayment(
      fetch,
      new x402Client().register(network, new ExactAvmScheme(signer)),
    );
  }

  console.log(`\nTendril @ ${API}`);
  console.log(`${asset.symbol} (ASA ${asset.id}) on ${GENESIS[network.split(":")[1]] ?? network}`);
  console.log(signer ? `payer ${signer.address}` : "no AVM_PRIVATE_KEY — free actions only");
  if (signer) {
    // Free and off-chain, so worth doing up front just to show a balance.
    await signIn().catch((e) => console.log(`sign-in failed (${e.message}) — balance hidden`));
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    console.log("");
    for (const [key, name, help, , needsKey] of MENU) {
      const locked = needsKey && !state.pay ? "  (needs AVM_PRIVATE_KEY)" : "";
      console.log(`  ${key}  ${name.padEnd(8)} ${help}${locked}`);
    }
    console.log("  q  quit");
    if (state.lease) console.log(`\n  lease ${state.lease.leaseId} active`);
    if (state.balance != null) console.log(`  balance ${usd(state.balance)}`);

    let choice;
    try {
      choice = (await rl.question("\n> ")).trim().toLowerCase();
    } catch {
      break; // stdin closed — piped input ran out, or ^D
    }
    if (choice === "q" || choice === "quit" || choice === "") break;
    const item = MENU.find(([key, name]) => key === choice || name === choice);
    if (!item) {
      console.log("  ?");
      continue;
    }
    const [, , , fn, needsKey] = item;
    if (needsKey && !state.pay) {
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

  if (state.lease) {
    // An open lease keeps metering against the balance until the watchdog kills it,
    // so a closed stdin releases rather than walking away from a running meter.
    let yes = "y";
    try {
      yes = (await rl.question(`release ${state.lease.leaseId} before quitting? [Y/n] `)).trim();
    } catch {
      /* stdin gone — release anyway */
    }
    if (!/^n/i.test(yes)) await release().catch((e) => console.log(`  ✗ ${e.message}`));
  }
  rl.close();
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

const cmd = process.argv[2];
try {
  if (cmd === "keygen") keygen();
  else if (cmd === "selftest") selftest();
  else await menu();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
