import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";

import { AppToaster } from "@/components/app-toaster";
import { WalletSessionProvider } from "@/components/wallet-session-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Proof Bags",
  description: "Token-gated course and assessment management on Solana with Bags.",
  icons: {
    icon: [
      { url: "/favicon-16x16.png?v=2", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico?v=2", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png?v=2",
  },
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
