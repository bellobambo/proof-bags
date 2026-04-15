"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiFetch } from "@/lib/client-api";
import type { PlatformUser, UserRole } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

type WalletSessionContextValue = {
  walletAddress: string;
  role: UserRole;
  displayName: string;
  registeredUser: PlatformUser | null;
  hydrated: boolean;
  setRole: (role: UserRole) => void;
  setDisplayName: (value: string) => void;
  setRegisteredUser: (user: PlatformUser | null) => void;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
};

type PersistedWalletSession = {
  sessionActive: boolean;
  walletAddress: string;
  role: UserRole;
  displayName: string;
  registeredUser: PlatformUser | null;
};

const STORAGE_KEY = "proof-bags.wallet-session";

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null);

function getWalletProvider(): SolanaProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.phantom?.solana ?? window.solana ?? null;
}

async function fetchRegisteredUser(walletAddress: string) {
  const data = await apiFetch<{ user: PlatformUser | null }>(
    `/api/users/register?walletAddress=${encodeURIComponent(walletAddress)}`,
  );

  return data.user;
}

export function WalletSessionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [walletAddress, setWalletAddress] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [displayName, setDisplayName] = useState("");
  const [registeredUser, setRegisteredUser] = useState<PlatformUser | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedWalletSession;
      setSessionActive(Boolean(parsed.sessionActive));
      setWalletAddress(parsed.walletAddress || "");
      setRole(parsed.role || "student");
      setDisplayName(parsed.displayName || "");
      setRegisteredUser(parsed.registeredUser || null);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    const payload: PersistedWalletSession = {
      sessionActive,
      walletAddress,
      role,
      displayName,
      registeredUser,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [displayName, hydrated, registeredUser, role, sessionActive, walletAddress]);

  useEffect(() => {
    if (!hydrated || !sessionActive || !walletAddress) {
      return;
    }

    void fetchRegisteredUser(walletAddress)
      .then((user) => {
        if (!user) {
          return;
        }

        setRegisteredUser(user);
        setRole(user.role);
        setDisplayName(user.displayName);
      })
      .catch(() => undefined);
  }, [hydrated, sessionActive, walletAddress]);

  useEffect(() => {
    if (!hydrated || !sessionActive) {
      return;
    }

    const provider = getWalletProvider();

    if (!provider) {
      return;
    }

    if (provider.publicKey) {
      setWalletAddress(provider.publicKey.toBase58());
      return;
    }

    void provider
      .connect({ onlyIfTrusted: true })
      .then((result) => setWalletAddress(result.publicKey.toBase58()))
      .catch(() => undefined);
  }, [hydrated, sessionActive]);

  useEffect(() => {
    const provider = getWalletProvider();

    if (!provider || typeof provider.on !== "function") {
      return;
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      const nextWallet = accounts[0] ?? "";
      setWalletAddress(nextWallet);

      if (!nextWallet) {
        setSessionActive(false);
        setRegisteredUser(null);
        setDisplayName("");
        setRole("student");
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);

    return () => {
      if (typeof provider.removeListener === "function") {
        provider.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, []);

  async function connectWallet() {
    const provider = getWalletProvider();

    if (!provider) {
      throw new Error(
        "Phantom-compatible wallet not found. Install Phantom or use an injected wallet browser.",
      );
    }

    const result = await provider.connect();
    setSessionActive(true);
    setWalletAddress(result.publicKey.toBase58());
  }

  async function disconnectWallet() {
    const provider = getWalletProvider();

    if (provider?.disconnect) {
      await provider.disconnect();
    }

    setSessionActive(false);
    setWalletAddress("");
    setRegisteredUser(null);
    setDisplayName("");
    setRole("student");
  }

  const value = useMemo<WalletSessionContextValue>(
    () => ({
      walletAddress,
      role,
      displayName,
      registeredUser,
      hydrated,
      setRole,
      setDisplayName,
      setRegisteredUser,
      connectWallet,
      disconnectWallet,
    }),
    [displayName, hydrated, registeredUser, role, walletAddress],
  );

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
}

export function useWalletSession() {
  const context = useContext(WalletSessionContext);

  if (!context) {
    throw new Error("useWalletSession must be used within WalletSessionProvider.");
  }

  return context;
}
