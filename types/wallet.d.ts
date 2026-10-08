import type { PublicKey, Transaction } from "@solana/web3.js";

declare global {
  interface Window {
    solana?: {
      publicKey?: PublicKey;
      connect: () => Promise<{ publicKey: PublicKey }>;
      signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string } | string>;
    };
  }
}

export {};
