# Tendril-Simple-App

Menu-driven CLI for the Tendril compute registry. One file. Pays with x402
(Algorand USDC) — the address needs **USDC and zero ALGO**, the facilitator
sponsors the network fee. Every paid action prints its transaction link.

## Setup

```bash
npm install
npm run keygen                       # prints Address + AVM_PRIVATE_KEY
cp .env.example .env                 # fill in REGISTRY_URL and AVM_PRIVATE_KEY
npm start
```

**The key goes in `.env`, never `.env.example`** — the example file is committed.

Fund the address: opt it into the USDC ASA (testnet `10458941`), then use the
testnet dispenser. An address that has not opted in fails at simulation with
`asset 10458941 missing from …` — nothing is charged, opt in and retry.

## The menu

```
  0  wallet   balance and lifetime totals
  1  market   list online nodes
  2  topup    buy credit
  3  rent     open a session
  4  run      execute a job (lease or one-shot)
  5  status   poll the lease
  6  release  stop the meter and bill
  q  quit
```

`market`, `status` and `release` are free. `topup`, `rent` and `run` settle on-chain
and print:

```
  tx  https://lora.algokit.io/testnet/transaction/ABC123…
```

Amounts are typed as USDC (`0.5`), or as atomic units with a `u` suffix (`500000u`).

Quitting with a lease still open prompts to release it first — an open lease keeps
metering against your balance. Release is also where compute is actually billed;
nothing is taken when the session opens.

## Config

Only two variables, both in `.env`:

| Var | Default | Meaning |
|---|---|---|
| `REGISTRY_URL` | `http://localhost:4000` | Registry base URL. |
| `AVM_PRIVATE_KEY` | — | base64 of the 64-byte ed25519 secret key. Without it the menu still runs, but paid actions are locked. |

Everything else the menu asks for. `rent` picks up `~/.ssh/id_ed25519.pub`
automatically as the sandbox's `authorized_keys`; without one you can still `run`
jobs, you just cannot SSH in.

## Checks

```bash
npm test        # asserts amount parsing and explorer-link building
```
