# Graph Report - .  (2026-09-30)

## Corpus Check
- Corpus is ~1,883 words - fits in a single context window. You may not need a graph.

## Summary
- 63 nodes · 100 edges · 7 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Package Manifest|Package Manifest]]
- [[_COMMUNITY_CLI Menu Actions|CLI Menu Actions]]
- [[_COMMUNITY_Registry and Secrets|Registry and Secrets]]
- [[_COMMUNITY_Node Rental Core|Node Rental Core]]
- [[_COMMUNITY_Payment and Job Run|Payment and Job Run]]
- [[_COMMUNITY_Wallet and Status|Wallet and Status]]
- [[_COMMUNITY_USDC Testnet Setup|USDC Testnet Setup]]

## God Nodes (most connected - your core abstractions)
1. `CLI Menu` - 9 edges
2. `usd()` - 7 edges
3. `run` - 7 edges
4. `AVM_PRIVATE_KEY` - 7 edges
5. `paid()` - 6 edges
6. `Tendril Simple App` - 6 edges
7. `x402` - 6 edges
8. `rent` - 6 edges
9. `MENU` - 5 edges
10. `Lease` - 5 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `usd()`  [EXTRACTED]
  src/index.mjs → src/index.mjs  _Bridges community 5 → community 4_
- `rent()` --calls--> `paid()`  [EXTRACTED]
  src/index.mjs → src/index.mjs  _Bridges community 4 → community 3_
- `Tendril Simple App` --references--> `CLI Menu`  [EXTRACTED]
  README.md → README.md  _Bridges community 2 → community 1_
- `x402` --references--> `Algorand USDC`  [EXTRACTED]
  README.md → README.md  _Bridges community 1 → community 6_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CLI Menu Commands** — readme_cli_menu, readme_wallet, readme_market, readme_topup, readme_rent, readme_run, readme_status, readme_release, readme_quit [EXTRACTED 1.00]
- **On-chain Paid Settlement** — readme_topup, readme_rent, readme_run, readme_x402, readme_algorand_usdc, readme_lora_explorer [INFERRED 0.85]
- **Lease Metering Lifecycle** — readme_rent, readme_run, readme_status, readme_release, readme_lease [INFERRED 0.85]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Package Manifest"
Cohesion: 0.14
Nodes (13): dependencies, algosdk, @x402/avm, @x402/core, @x402/fetch, name, private, scripts (+5 more)

### Community 1 - "CLI Menu Actions"
Cohesion: 0.25
Nodes (14): CLI Menu, x402 Facilitator, Lease, Lora Explorer, One-shot Job, quit, release, rent (+6 more)

### Community 2 - "Registry and Secrets"
Cohesion: 0.36
Nodes (8): AVM_PRIVATE_KEY, .env.example, .env, keygen, market, REGISTRY_URL, Tendril Compute Registry, Tendril Simple App

### Community 3 - "Node Rental Core"
Cohesion: 0.32
Nodes (6): API, defaultSshKey(), GENESIS, listNodes(), rent(), state

### Community 4 - "Payment and Job Run"
Cohesion: 0.33
Nodes (7): json(), paid(), run(), selftest(), toAtomic(), topup(), txLink()

### Community 5 - "Wallet and Status"
Cohesion: 0.38
Nodes (7): makeSigner(), MENU, release(), signIn(), status(), usd(), wallet()

### Community 6 - "USDC Testnet Setup"
Cohesion: 0.50
Nodes (5): Algorand USDC, USDC Amount Format, npm test, Testnet Dispenser, USDC ASA Opt-in

## Knowledge Gaps
- **18 isolated node(s):** `name`, `version`, `private`, `type`, `keygen` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `x402` connect `CLI Menu Actions` to `Registry and Secrets`, `USDC Testnet Setup`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `CLI Menu` connect `CLI Menu Actions` to `Registry and Secrets`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `run` connect `CLI Menu Actions` to `Registry and Secrets`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._