import { NextResponse } from "next/server";
import { associatedTokenAddress, connection, loadCampaign } from "../../../../lib/solana";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await context.params;
    const campaign = await loadCampaign(address);
    const mint = await connection.getParsedAccountInfo(campaign.mint, "confirmed");
    const parsedMint = mint.value?.data;
    if (!parsedMint || !("parsed" in parsedMint)) throw new Error("Campaign token mint could not be read");
    const decimals = Number((parsedMint.parsed as { info: { decimals: number } }).info.decimals);
    const vaultAddress = associatedTokenAddress(new (await import("@solana/web3.js")).PublicKey(address), campaign.mint);
    const vaultInfo = await connection.getAccountInfo(vaultAddress, "confirmed");
    const poolBalance = vaultInfo ? vaultInfo.data.readBigUInt64LE(64).toString() : "0";
    return NextResponse.json({
      address: campaign.address,
      authority: campaign.authority.toBase58(),
      recipient: campaign.recipient.toBase58(),
      mint: campaign.mint.toBase58(),
      decimals,
      expiresAt: Number(campaign.expiresAt),
      matchBps: campaign.matchBps,
      maxMatchPerDonation: campaign.maxMatchPerDonation.toString(),
      totalDonated: campaign.totalDonated.toString(),
      totalMatched: campaign.totalMatched.toString(),
      poolBalance,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load campaign";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
