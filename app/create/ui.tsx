"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { connection, createCampaignTransaction, explorerAccount } from "../../lib/solana";

function toUnits(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a valid positive token amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`This token supports at most ${decimals} decimal places`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export default function CreateCampaign() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");
  const [mint, setMint] = useState("");
  const [rate, setRate] = useState("100");
  const [perDonation, setPerDonation] = useState("5");
  const [perWallet, setPerWallet] = useState("25");
  const [pool, setPool] = useState("100");
  const [goal, setGoal] = useState("500");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [campaign, setCampaign] = useState("");
  const [signature, setSignature] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setCampaign(""); setSignature("");
    try {
      if (!title.trim()) throw new Error("Add a campaign name");
      if (!window.solana) throw new Error("Open this page in a browser with Phantom installed");
      if (!process.env.NEXT_PUBLIC_PROGRAM_ID) throw new Error("Program ID is not configured yet. Build and deploy the Anchor program first.");
      const donor = window.solana.publicKey || (await window.solana.connect()).publicKey;
      const mintKey = new PublicKey(mint.trim());
      const recipientKey = new PublicKey(recipient.trim());
      const mintInfo = await connection.getParsedAccountInfo(mintKey, "confirmed");
      const parsedMint = mintInfo.value?.data;
      if (!parsedMint || !("parsed" in parsedMint)) throw new Error("Mint account was not found on devnet");
      const decimals = Number((parsedMint.parsed as { info: { decimals: number } }).info.decimals);
      const id = crypto.getRandomValues(new Uint8Array(32));
      const { campaign: campaignPda, transaction } = createCampaignTransaction({
        authority: donor,
        mint: mintKey,
        recipient: recipientKey,
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + Number(days) * 86400),
        matchBps: Math.round(Number(rate) * 100),
        maxMatchPerDonation: toUnits(perDonation, decimals),
        maxMatchPerWallet: toUnits(perWallet, decimals),
        poolAmount: toUnits(pool, decimals),
        campaignId: id,
      });
      const latest = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = donor;
      transaction.recentBlockhash = latest.blockhash;
      const result = await window.solana.signAndSendTransaction(transaction);
      const txSignature = typeof result === "string" ? result : result.signature;
      const confirmation = await connection.confirmTransaction({ signature: txSignature, ...latest }, "confirmed");
      if (confirmation.value.err) throw new Error("Campaign creation transaction failed");
      setCampaign(campaignPda.toBase58()); setSignature(txSignature);
      setMessage("Campaign created and matching pool funded in one transaction.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Campaign could not be created"); }
    finally { setBusy(false); }
  }

  const landing = campaign && typeof window !== "undefined"
    ? `${window.location.origin}/?campaign=${campaign}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&goal=${encodeURIComponent(goal)}`
    : "";

  return <main className="create-shell">
    <a className="create-brand" href="/">← <span className="brand-mark">↗</span> matchlink</a>
    <div className="create-layout"><section className="create-intro"><div className="eyebrow">A better way to give</div><h1>Start a<br /><em>matched</em><br />campaign.</h1><p>Set the rules once. Every donor sees the boost before signing, and the sponsor match moves with the gift.</p><div className="create-points"><span><b>01</b> Set a recipient and token</span><span><b>02</b> Choose match limits</span><span><b>03</b> Fund and share your link</span></div></section>
      <form className="create-form" onSubmit={submit}><div className="create-form-heading"><span className="eyebrow">CAMPAIGN SETUP · DEVNET</span><h2>Make it easy to say yes.</h2><p>Your campaign rules and sponsor pool go on-chain.</p></div>
        <label>Campaign name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Open-source for everyone" maxLength={70} required /></label>
        <label>What are you raising for?<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell donors what their support makes possible…" rows={3} maxLength={320} /></label>
        <div className="form-row"><label>Recipient wallet<input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Solana address" required /></label><label>Test token mint<input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Devnet SPL mint" required /></label></div>
        <div className="form-section-title">MATCHING RULES <span>01</span></div>
        <div className="form-row three"><label>Match rate <div className="input-suffix"><input type="number" min="1" max="100" value={rate} onChange={(e) => setRate(e.target.value)} required /><span>%</span></div></label><label>Max per donation <div className="input-suffix"><input value={perDonation} onChange={(e) => setPerDonation(e.target.value)} required /><span>TOKEN</span></div></label><label>Max per donor <div className="input-suffix"><input value={perWallet} onChange={(e) => setPerWallet(e.target.value)} required /><span>TOKEN</span></div></label></div>
        <div className="form-row three"><label>Sponsor pool <div className="input-suffix"><input value={pool} onChange={(e) => setPool(e.target.value)} required /><span>TOKEN</span></div></label><label>Community goal <div className="input-suffix"><input value={goal} onChange={(e) => setGoal(e.target.value)} required /><span>TOKEN</span></div></label><label>Ends in <div className="input-suffix"><input type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} required /><span>DAYS</span></div></label></div>
        <button className="give create-submit" disabled={busy}>{busy ? "Waiting for wallet…" : `Create & fund with ${pool} tokens`}</button>
        <p className="create-footnote">One wallet transaction creates the campaign and funds its match pool. Devnet test tokens only.</p>
        {message && <p className={`create-message ${campaign ? "good" : ""}`}>{message}</p>}
        {campaign && <div className="created-result"><b>Campaign is ready</b><a href={landing}>Open campaign page ↗</a><a href={explorerAccount(campaign)} target="_blank" rel="noreferrer">Inspect campaign account ↗</a><code>{campaign}</code><a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer">View setup transaction ↗</a></div>}
      </form>
    </div>
  </main>;
}
