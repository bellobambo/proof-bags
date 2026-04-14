import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export type SolanaProvider = {
  publicKey?: PublicKey;
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect?: () => Promise<void>;
  signAndSendTransaction: (
    transaction: Transaction | VersionedTransaction,
  ) => Promise<{ signature: string }>;
};

declare global {
  interface Window {
    phantom?: {
      solana?: SolanaProvider;
    };
    solana?: SolanaProvider;
  }
}

export {};
