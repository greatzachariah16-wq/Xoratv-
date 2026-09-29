import crypto from "node:crypto";
import { getCleanDbUrl, getFirebaseAccessToken, queryRtdb } from "./xseries-service-account";

export type WalletTransaction = {
  id: string;
  type: "deposit" | "purchase" | "refund" | "adjustment";
  status: "pending" | "successful" | "failed" | "reversed";
  amount: number;
  currency: "NGN";
  reference: string;
  description: string;
  createdAt: string;
  completedAt?: string | null;
  providerReference?: string | null;
};

type Wallet = {
  userId: string;
  balance: number;
  currency: "NGN";
  transactions: Record<string, WalletTransaction>;
};

const walletPath = (userId: string) => `commerce/wallets/${encodeURIComponent(userId)}`;
const depositsPath = "commerce/walletDeposits";
const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

async function readWallet(userId: string): Promise<Wallet> {
  const raw = await queryRtdb(walletPath(userId)) as Partial<Wallet> | null;
  const transactions = raw?.transactions
    ? (Array.isArray(raw.transactions)
      ? Object.fromEntries(raw.transactions.map((x: WalletTransaction) => [x.id, x]))
      : raw.transactions)
    : {};
  return {
    userId,
    balance: Number(raw?.balance || 0),
    currency: "NGN",
    transactions: transactions as Record<string, WalletTransaction>,
  };
}

export async function getWallet(userId: string) {
  const wallet = await readWallet(userId);
  return {
    userId,
    balance: wallet.balance,
    currency: wallet.currency,
    transactions: Object.values(wallet.transactions)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50),
  };
}

/**
 * Creates a funding request without connecting a payment provider.
 * The payment rail is intentionally left unconfigured until Xora supplies one.
 */
export async function createWalletDeposit(params: { userId: string; amount: number }) {
  const amount = Math.round(Number(params.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 100) throw new Error("Minimum wallet funding amount is ₦100.");
  if (amount > 1000000) throw new Error("Wallet funding amount is above the current single-request limit.");

  const now = new Date().toISOString();
  const reference = id("xora-deposit").replace(/_/g, "-");
  const deposit = {
    id: id("deposit"),
    userId: params.userId,
    type: "deposit",
    status: "pending",
    amount,
    expectedAmount: amount,
    currency: "NGN",
    reference,
    description: "Xora wallet funding request",
    createdAt: now,
    completedAt: null,
    creditedAt: null,
    fundingProvider: null,
  };

  await queryRtdb(`${depositsPath}/${deposit.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deposit),
  });

  return {
    depositId: deposit.id,
    reference,
    amount,
    status: "pending" as const,
    providerConfigured: false,
    message: "Your funding request was created. Xora has not connected an external payment provider yet.",
  };
}

async function conditionalWalletUpdate(
  userId: string,
  updater: (wallet: Wallet) => Wallet,
): Promise<Wallet> {
  const base = getCleanDbUrl();
  const token = await getFirebaseAccessToken();
  if (!base || !token) {
    // Local/dev fallback. Production uses Firebase conditional PUT below.
    const current = await readWallet(userId);
    const updated = updater(current);
    await queryRtdb(walletPath(userId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    return updated;
  }

  const target = `${base}/${walletPath(userId)}.json`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const read = await fetch(`${target}?access_token=${encodeURIComponent(token)}`, {
      headers: { "X-Firebase-ETag": "true" },
      signal: AbortSignal.timeout(12000),
    });
    if (!read.ok) throw new Error(`Unable to read wallet (HTTP ${read.status}).`);
    const currentRaw = await read.json().catch(() => null);
    const etag = read.headers.get("etag");
    const current: Wallet = {
      userId,
      balance: Number(currentRaw?.balance || 0),
      currency: "NGN",
      transactions: currentRaw?.transactions
        ? (Array.isArray(currentRaw.transactions)
          ? Object.fromEntries(currentRaw.transactions.map((x: WalletTransaction) => [x.id, x]))
          : currentRaw.transactions)
        : {},
    };
    const updated = updater(current);
    const write = await fetch(`${target}?access_token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-match": etag || "null_etag",
      },
      body: JSON.stringify(updated),
      signal: AbortSignal.timeout(12000),
    });
    if (write.ok) return updated;
    if (write.status !== 412) throw new Error(`Unable to update wallet (HTTP ${write.status}).`);
  }
  throw new Error("Wallet changed while processing the transaction. Please try again.");
}

export async function debitWallet(params: {
  userId: string;
  amount: number;
  reference: string;
  description: string;
}) {
  const amount = Math.round(Number(params.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid wallet debit amount.");

  const now = new Date().toISOString();
  let transaction: WalletTransaction | null = null;

  const wallet = await conditionalWalletUpdate(params.userId, (current) => {
    const existing = Object.values(current.transactions).find(
      (tx) => tx.reference === params.reference && tx.type === "purchase" && tx.status === "successful",
    );
    if (existing) {
      transaction = existing;
      return current;
    }
    if (current.balance < amount) {
      throw new Error("Insufficient wallet balance.");
    }
    const tx: WalletTransaction = {
      id: id("wallet_purchase"),
      type: "purchase",
      status: "successful",
      amount: -amount,
      currency: "NGN",
      reference: params.reference,
      description: params.description,
      createdAt: now,
      completedAt: now,
      providerReference: null,
    };
    transaction = tx;
    return {
      ...current,
      balance: Math.round((current.balance - amount) * 100) / 100,
      transactions: { ...current.transactions, [tx.id]: tx },
    };
  });

  return { wallet, transaction: transaction! };
}

export async function creditWallet(params: {
  userId: string;
  amount: number;
  reference: string;
  description: string;
  providerReference?: string | null;
}) {
  const amount = Math.round(Number(params.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid wallet credit amount.");

  const now = new Date().toISOString();
  let transaction: WalletTransaction | null = null;
  const wallet = await conditionalWalletUpdate(params.userId, (current) => {
    const existing = Object.values(current.transactions).find(
      (tx) => tx.reference === params.reference && tx.type === "deposit" && tx.status === "successful",
    );
    if (existing) {
      transaction = existing;
      return current;
    }
    const tx: WalletTransaction = {
      id: id("wallet_deposit"),
      type: "deposit",
      status: "successful",
      amount,
      currency: "NGN",
      reference: params.reference,
      description: params.description,
      createdAt: now,
      completedAt: now,
      providerReference: params.providerReference || null,
    };
    transaction = tx;
    return {
      ...current,
      balance: Math.round((current.balance + amount) * 100) / 100,
      transactions: { ...current.transactions, [tx.id]: tx },
    };
  });
  return { wallet, transaction: transaction! };
}

export async function getWalletDepositStatus(reference: string, userId: string) {
  const raw = await queryRtdb(depositsPath) as Record<string, any> | any[] | null;
  const list = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
  const deposit = list.find((d: any) => d?.reference === reference && d?.userId === userId);
  if (!deposit) throw new Error("Wallet funding request not found.");
  return {
    id: deposit.id,
    reference: deposit.reference,
    amount: Number(deposit.amount),
    status: deposit.status,
    creditedAt: deposit.creditedAt || null,
    providerConfigured: false,
  };
}
