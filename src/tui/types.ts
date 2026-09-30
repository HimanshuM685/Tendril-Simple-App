export type NodeInfo = {
  id: string;
  status?: string;
  pricePerHourUsd: number;
  cpuCores: number;
  ramMb: number;
  gpu?: string;
  label?: string;
  payoutBlocked?: boolean;
};

export type WalletStats = {
  totalSpentAtomic: string | number;
  totalToppedUpAtomic: string | number;
  totalEarnedAtomic: string | number;
  payoutCount: number;
  leaseCount: number;
  totalLeaseSeconds: number;
};

export type WalletInfo = {
  address: string;
  balanceAtomic: string | number;
  stats: WalletStats;
  topups: unknown[];
  charges: unknown[];
  payouts: unknown[];
};

export type Lease = {
  leaseId: string;
  leaseToken?: string;
  fundedUntil?: string;
  ssh?: { command?: string; authMethod?: string; password?: string };
  billing?: { creditAtomic?: string | number };
};

export type LeaseView = {
  status?: string;
  rateAtomicPerHour?: string | number;
  expiresAt?: string;
};

export type RunResult = {
  jobId?: string;
  ok?: boolean;
  result?: unknown;
  execution?: {
    nodeId?: string;
    seconds?: number;
    costAtomic?: string | number;
    balance?: string | number;
  } | null;
};

export type Bill = {
  usedSeconds: number;
  chargedAtomic: string | number;
  balance: string | number;
};

export type SessionSnap = {
  api: string;
  address: string | null;
  balance: string | number | null;
  network: string | null;
  networkName: string;
  asset: { symbol: string; id: number | string } | null;
  hasPay: boolean;
  signInError: string | null;
  lease: Lease | null;
  leaseView: LeaseView | null;
  openedAt: number | null;
  nodes: NodeInfo[];
  wallet: WalletInfo | null;
  sshWarning: string | null;
};

export type View = SessionSnap & {
  loading: boolean;
  pending: boolean;
  error: string | null;
  notice: string | null;
  lastTx: string | null;
  lastRun: (RunResult & { txUrl?: string | null }) | null;
  lastBill: Bill | null;
};

export type TendrilSession = {
  snapshot: () => SessionSnap;
  boot: () => Promise<SessionSnap>;
  loadWallet: () => Promise<WalletInfo>;
  listNodes: () => Promise<NodeInfo[]>;
  topup: (input: string) => Promise<{ txUrl: string | null; credited: string | number; balance: string | number }>;
  rent: (node: NodeInfo) => Promise<{ txUrl: string | null; lease: Lease; sshWarning: string | null }>;
  run: (payload: string) => Promise<RunResult & { txUrl: string | null; oneShot: boolean }>;
  status: () => Promise<LeaseView>;
  release: () => Promise<Bill>;
};

export const LOCKED = "needs AVM_PRIVATE_KEY in .env — run `npm run keygen`";

export const DEFAULT_PAYLOAD = "print(sum(range(100)))";

export function emptyView(): View {
  return {
    api: "",
    address: null,
    balance: null,
    network: null,
    networkName: "",
    asset: null,
    hasPay: false,
    signInError: null,
    lease: null,
    leaseView: null,
    openedAt: null,
    nodes: [],
    wallet: null,
    sshWarning: null,
    loading: true,
    pending: false,
    error: null,
    notice: null,
    lastTx: null,
    lastRun: null,
    lastBill: null,
  };
}
