import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";

import { AppToaster } from "@/components/app-toaster";
import { WalletSessionProvider } from "@/components/wallet-session-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Proof Bags",
  description: "Token-gated course and assessment management on Solana with Bags.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--background)] font-sans text-[var(--foreground)]">
        <AntdRegistry>
          <WalletSessionProvider>
            {children}
            <AppToaster />
          </WalletSessionProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
