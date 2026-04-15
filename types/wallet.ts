import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export type SolanaProvider = {
  publicKey?: PublicKey;
  isPhantom?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
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
