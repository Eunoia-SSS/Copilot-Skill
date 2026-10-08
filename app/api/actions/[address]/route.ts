import type { ActionGetResponse, ActionPostResponse } from "@solana/actions";
import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, connection, createAssociatedTokenAccountIdempotentInstruction, donationInstruction, loadCampaign, TOKEN_PROGRAM_ID } from "../../../../lib/solana";

export const dynamic = "force-dynamic";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await context.params;
    const campaign = await loadCampaign(address);
    const mintInfo = await connection.getParsedAccountInfo(campaign.mint, "confirmed");
    const parsedMint = mintInfo.value?.data;
    if (!parsedMint || !("parsed" in parsedMint)) throw new Error("Campaign mint is unavailable");
    const decimals = Number((parsedMint.parsed as { info: { decimals: number } }).info.decimals);
    const base = new URL(request.url);
    const body: ActionGetResponse = {
      type: "action",
      icon: `${base.origin}/matchlink.svg`,
      title: "MatchLink donation",
      description: `Donate to this campaign. ${campaign.matchBps / 100}% sponsor matching, up to ${(Number(campaign.maxMatchPerDonation) / 10 ** decimals).toLocaleString()} tokens per donation.`,
      label: "Donate",
      links: { actions: [1, 5, 10].map((amount) => ({
        type: "transaction" as const,
        label: `Donate ${amount}`,
        href: `${base.origin}/api/actions/${address}?amount=${amount}`,
      })) },
    };
    return json(body);
  } catch (error) {
    return json({ error: { message: error instanceof Error ? error.message : "Campaign unavailable" } }, 400);
  }
}

export async function POST(request: Request, context: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await context.params;
    const campaign = await loadCampaign(address);
    const body = await request.json() as { account?: string; amount?: string | number };
    const actionAmount = body.amount ?? new URL(request.url).searchParams.get("amount");
    if (!body.account || actionAmount === null || actionAmount === undefined) throw new Error("Wallet account and donation amount are required");
    const donor = new PublicKey(body.account);
    if (donor.equals(campaign.recipient)) throw new Error("The campaign recipient cannot donate to this campaign");
    if (Number(campaign.expiresAt) <= Math.floor(Date.now() / 1000)) throw new Error("This campaign has ended");
    const amountText = String(actionAmount).trim();
    if (!/^\d+(\.\d+)?$/.test(amountText)) throw new Error("Amount must be a positive decimal number");
    const mintInfo = await connection.getParsedAccountInfo(campaign.mint, "confirmed");
    const parsedMint = mintInfo.value?.data;
    if (!parsedMint || !("parsed" in parsedMint)) throw new Error("Campaign mint is unavailable");
    const decimals = Number((parsedMint.parsed as { info: { decimals: number } }).info.decimals);
    const [whole, fraction = ""] = amountText.split(".");
    if (fraction.length > decimals) throw new Error(`Token supports at most ${decimals} decimal places`);
    const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
    if (amount <= 0n) throw new Error("Amount must be greater than zero");
    const latest = await connection.getLatestBlockhash("confirmed");
    const donorTokens = PublicKey.findProgramAddressSync(
      [donor.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), campaign.mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0];
    const recipientTokens = PublicKey.findProgramAddressSync(
      [campaign.recipient.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), campaign.mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0];
    const transaction = new Transaction({ feePayer: donor, ...latest })
      .add(createAssociatedTokenAccountIdempotentInstruction(donor, donorTokens, donor, campaign.mint))
      .add(createAssociatedTokenAccountIdempotentInstruction(donor, recipientTokens, campaign.recipient, campaign.mint))
      .add(donationInstruction(campaign, donor, amount));
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const response: ActionPostResponse = {
      type: "transaction",
      transaction: serialized,
      message: `Donate ${amountText} tokens. The sponsor match settles atomically with your gift.`,
    };
    return json(response);
  } catch (error) {
    return json({ error: { message: error instanceof Error ? error.message : "Unable to prepare donation" } }, 400);
  }
}
