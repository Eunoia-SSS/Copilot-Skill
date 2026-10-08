import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MatchLink — matching that moves with the donation",
  description: "Share a Solana donation link. Every donation is matched on-chain in the same transaction.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
