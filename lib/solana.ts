import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";

export const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
export const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;
export const connection = new Connection(RPC_URL, "confirmed");
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export type CampaignState = {
  address: string;
  authority: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  campaignId: Buffer;
  bump: number;
  expiresAt: bigint;
  matchBps: number;
  maxMatchPerDonation: bigint;
  maxMatchPerWallet: bigint;
  totalDonated: bigint;
  totalMatched: bigint;
};

export function parseCampaign(address: string, data: Buffer): CampaignState {
  if (data.length < 179) throw new Error("Campaign account data is too short");
  return {
    address,
    authority: new PublicKey(data.subarray(8, 40)),
    campaignId: data.subarray(40, 72),
    recipient: new PublicKey(data.subarray(72, 104)),
    mint: new PublicKey(data.subarray(104, 136)),
    bump: data[136],
    expiresAt: data.readBigInt64LE(137),
    matchBps: data.readUInt16LE(145),
    maxMatchPerDonation: data.readBigUInt64LE(147),
    maxMatchPerWallet: data.readBigUInt64LE(155),
    totalDonated: data.readBigUInt64LE(163),
    totalMatched: data.readBigUInt64LE(171),
  };
}

export async function loadCampaign(address: string): Promise<CampaignState> {
  if (!PROGRAM_ID) throw new Error("NEXT_PUBLIC_PROGRAM_ID is not configured");
  const pubkey = new PublicKey(address);
  const info = await connection.getAccountInfo(pubkey, "confirmed");
  if (!info) throw new Error("Campaign account was not found on the configured cluster");
  if (!info.owner.equals(new PublicKey(PROGRAM_ID))) throw new Error("Campaign account belongs to another program");
  return parseCampaign(address, info.data);
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function createAssociatedTokenAccountIdempotentInstruction(payer: PublicKey, address: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export function donationInstruction(campaign: CampaignState, donor: PublicKey, rawAmount: bigint): TransactionInstruction {
  if (!PROGRAM_ID) throw new Error("NEXT_PUBLIC_PROGRAM_ID is not configured");
  const programId = new PublicKey(PROGRAM_ID);
  const recipientTokens = associatedTokenAddress(campaign.recipient, campaign.mint);
  const donorTokens = associatedTokenAddress(donor, campaign.mint);
  const actualVault = associatedTokenAddress(new PublicKey(campaign.address), campaign.mint);
  const [donorStats] = PublicKey.findProgramAddressSync(
    [Buffer.from("donor"), new PublicKey(campaign.address).toBuffer(), donor.toBuffer()], programId,
  );
  const discriminator = Buffer.from([209, 59, 107, 51, 144, 101, 45, 208]);
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(rawAmount);
  const data = Buffer.concat([discriminator, amount]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: donor, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(campaign.address), isSigner: false, isWritable: true },
      { pubkey: donorStats, isSigner: false, isWritable: true },
      { pubkey: campaign.recipient, isSigner: false, isWritable: false },
      { pubkey: campaign.mint, isSigner: false, isWritable: false },
      { pubkey: donorTokens, isSigner: false, isWritable: true },
      { pubkey: recipientTokens, isSigner: false, isWritable: true },
      { pubkey: actualVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function createCampaignTransaction(input: {
  authority: PublicKey;
  mint: PublicKey;
  recipient: PublicKey;
  expiresAt: bigint;
  matchBps: number;
  maxMatchPerDonation: bigint;
  maxMatchPerWallet: bigint;
  poolAmount: bigint;
  campaignId: Uint8Array;
}) {
  if (!PROGRAM_ID) throw new Error("NEXT_PUBLIC_PROGRAM_ID is not configured");
  const programId = new PublicKey(PROGRAM_ID);
  const id = Buffer.from(input.campaignId);
  const [campaign] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), input.authority.toBuffer(), id], programId,
  );
  const vault = associatedTokenAddress(campaign, input.mint);
  const sponsorTokens = associatedTokenAddress(input.authority, input.mint);
  const createData = Buffer.alloc(8 + 32 + 32 + 8 + 2 + 8 + 8);
  Buffer.from([111, 131, 187, 98, 160, 193, 114, 244]).copy(createData, 0);
  id.copy(createData, 8);
  input.recipient.toBuffer().copy(createData, 40);
  createData.writeBigInt64LE(input.expiresAt, 72);
  createData.writeUInt16LE(input.matchBps, 80);
  createData.writeBigUInt64LE(input.maxMatchPerDonation, 82);
  createData.writeBigUInt64LE(input.maxMatchPerWallet, 90);
  const create = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: createData,
  });
  const fundData = Buffer.alloc(16);
  Buffer.from([36, 57, 233, 176, 181, 20, 87, 159]).copy(fundData, 0);
  fundData.writeBigUInt64LE(input.poolAmount, 8);
  const fund = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: sponsorTokens, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: fundData,
  });
  const transaction = new Transaction()
    .add(createAssociatedTokenAccountIdempotentInstruction(input.authority, sponsorTokens, input.authority, input.mint))
    .add(create)
    .add(fund);
  return { campaign, transaction };
}

export function closeCampaignInstruction(campaign: Pick<CampaignState, "address" | "mint">, authority: PublicKey): TransactionInstruction {
  if (!PROGRAM_ID) throw new Error("NEXT_PUBLIC_PROGRAM_ID is not configured");
  const programId = new PublicKey(PROGRAM_ID);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(campaign.address), isSigner: false, isWritable: true },
      { pubkey: campaign.mint, isSigner: false, isWritable: false },
      { pubkey: associatedTokenAddress(authority, campaign.mint), isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(new PublicKey(campaign.address), campaign.mint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([65, 49, 110, 7, 63, 238, 206, 77]),
  });
}

export function explorerAccount(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${CLUSTER}`;
}

export function explorerTransaction(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

export { PublicKey };
