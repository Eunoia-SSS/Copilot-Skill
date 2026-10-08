"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { closeCampaignInstruction, connection, explorerAccount, explorerTransaction } from "../lib/solana";

type Campaign = {
  address: string;
  authority: string;
  recipient: string;
  mint: string;
  decimals: number;
  expiresAt: number;
  matchBps: number;
  maxMatchPerDonation: string;
  totalDonated: string;
  totalMatched: string;
  poolBalance: string;
};

const DEMO_TOTAL = 3240;
const DEMO_GOAL = 5000;
const DEMO_MATCH_POOL = 1200;
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

export default function MatchLinkApp({ campaignAddress, campaignTitle, campaignDescription, campaignGoal }: { campaignAddress: string; campaignTitle: string; campaignDescription: string; campaignGoal: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selected, setSelected] = useState(5);
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [receipt, setReceipt] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [closed, setClosed] = useState(false);

  const isLive = Boolean(campaignAddress && campaign);
  const actionUrl = useMemo(() => {
    if (typeof window === "undefined" || !campaignAddress) return "";
    return `${window.location.origin}/api/actions/${campaignAddress}`;
  }, [campaignAddress]);

  useEffect(() => {
    if (!campaignAddress || closed) return;
    let active = true;
    const load = () => fetch(`/api/campaign/${campaignAddress}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Campaign could not be loaded");
        if (active) setCampaign(body);
      })
      .catch((error: Error) => { if (active) setStatus(error.message); });
    void load();
    const timer = window.setInterval(load, 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, [campaignAddress, receipt, closed]);

  useEffect(() => {
    if (!actionUrl) return;
    void QRCode.toDataURL(actionUrl, { width: 160, margin: 1, color: { dark: "#17332e", light: "#ffffff" } })
      .then(setQr).catch(() => setQr(""));
  }, [actionUrl]);

  async function connectWallet() {
    try {
      if (!window.solana?.connect) throw new Error("Install or open Phantom to connect a wallet.");
      const result = await window.solana.connect();
      setWallet(result.publicKey.toBase58());
      setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Wallet connection failed"); }
  }

  async function donate() {
    if (!campaign || !window.solana) { await connectWallet(); return; }
    setBusy(true); setStatus(""); setReceipt("");
    try {
      const donor = window.solana.publicKey || (await window.solana.connect()).publicKey;
      setWallet(donor.toBase58());
      const result = await fetch(`/api/actions/${campaign.address}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: donor.toBase58(), amount: selected.toString() }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error?.message || payload.message || "Could not prepare donation");
      const unsigned = Transaction.from(Buffer.from(payload.transaction, "base64"));
      const sent = await window.solana.signAndSendTransaction(unsigned);
      const signature = typeof sent === "string" ? sent : sent.signature;
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error("Transaction failed on-chain");
      setReceipt(signature);
      setStatus("Donation confirmed. The matching transfer settled in the same transaction.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Donation failed");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    if (!actionUrl) return;
    await navigator.clipboard.writeText(actionUrl);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  async function reclaimPool() {
    if (!campaign || !window.solana) return;
    setBusy(true); setStatus("");
    try {
      const authority = window.solana.publicKey || (await window.solana.connect()).publicKey;
      const transaction = new Transaction().add(closeCampaignInstruction({ address: campaign.address, mint: new PublicKey(campaign.mint) }, authority));
      const latest = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = authority; transaction.recentBlockhash = latest.blockhash;
      const sent = await window.solana.signAndSendTransaction(transaction);
      const signature = typeof sent === "string" ? sent : sent.signature;
      const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      if (confirmation.value.err) throw new Error("Campaign close transaction failed");
      setClosed(true); setReceipt(signature); setStatus("Campaign closed. Remaining pool tokens returned to the sponsor.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not reclaim the pool"); }
    finally { setBusy(false); }
  }

  const total = campaign ? Number(campaign.totalDonated) / 10 ** campaign.decimals : DEMO_TOTAL;
  const pool = campaign ? Number(campaign.poolBalance) / 10 ** campaign.decimals : DEMO_MATCH_POOL;
  const goal = Number(campaignGoal) || (campaign ? Math.max(total * 1.5, 100) : DEMO_GOAL);
  const matchLabel = campaign ? `${campaign.matchBps / 100}%` : "1:1";
  const campaignEnded = Boolean(campaign && campaign.expiresAt <= Math.floor(Date.now() / 1000));
  const isSponsor = Boolean(campaign && wallet && wallet === campaign.authority);
  const estimate = campaign ? Math.min(selected * campaign.matchBps / 10000, Number(campaign.maxMatchPerDonation) / 10 ** campaign.decimals, pool) : selected;
  const symbol = campaign ? "TOKEN" : "USDC";

  return <main className="shell">
    <nav className="nav">
      <div className="brand"><span className="brand-mark">↗</span> matchlink</div>
      <div className="nav-right"><div className="network"><span className="dot" /> SOLANA DEVNET</div><button className="outline" onClick={connectWallet}>{wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "Connect wallet"}</button></div>
    </nav>

    {!campaignAddress && <div className="notice">Preview mode · Configure a devnet campaign address to enable live balances and donations.</div>}
    {campaignAddress && !campaign && status && <div className="notice">Waiting for campaign · {status}</div>}

    <section className="hero">
      <div><div className="eyebrow">Community giving, multiplied</div><h1>Good things<br /><em>travel further.</em></h1><p className="hero-copy">One simple donation. One sponsor match. Settled together on Solana — right from the link you share.</p></div>
      <div className="hero-stats"><div className="hero-stat"><strong>{fmt(total)} {symbol}</strong><span>raised by the community</span></div><div className="hero-stat"><strong>{fmt(pool)} {symbol}</strong><span>matching pool remaining</span></div><div className="hero-stat"><strong>{matchLabel}</strong><span>community match rate</span></div><div className="hero-stat"><strong>{campaign ? "On-chain" : "Devnet preview"}</strong><span>transparent by design</span></div></div>
    </section>

    <section className="campaign">
      <article className="story">
        <div className="story-image"><div className="image-top"><span className="tag">COMMUNITY CAMPAIGN</span><span className="image-foot">№ 001 — MATCHED GIVING</span></div><div className="image-bottom"><div className="image-title">Build a brighter corner<br />of the internet.</div><span className="image-foot">SOLANA · DEVNET</span></div></div>
        <div className="story-body"><div className="story-title-row"><h2>{campaignTitle}</h2><span className="verified">✳ VERIFIED ON-CHAIN</span></div><p className="story-desc">{campaignDescription}</p><div className="progress-label"><span>COMMUNITY PROGRESS</span><span>{fmt(total)} / {fmt(goal)} {symbol}</span></div><div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, total / goal * 100))}%` }} /></div><div className="story-foot"><div className="avatars"><span className="avatar">A</span><span className="avatar">M</span><span className="avatar">K</span><span className="avatar">S</span></div><span>{campaign ? `${campaign.authority.slice(0, 5)}…${campaign.authority.slice(-4)} sponsors` : "A community-backed campaign"}</span><span>{campaign ? new Date(campaign.expiresAt * 1000).toLocaleDateString() : "Ends when the goal is reached"}</span></div></div>
      </article>

        <aside className="donate"><div className="donate-head"><h3>Make it count</h3><span className="live"><i className="dot" /> {isLive ? "LIVE" : "PREVIEW"}</span></div><p className="donate-copy">Choose an amount. Your wallet shows the full transfer before you sign.</p><div className="amount-label">YOUR CONTRIBUTION · {symbol}</div><div className="amounts">{[1, 5, 10].map((amount) => <button key={amount} className={`amount ${selected === amount ? "active" : ""}`} onClick={() => setSelected(amount)}>{amount} {symbol}<small>up to +{fmt(Math.min(amount * (campaign ? campaign.matchBps / 10000 : 1), campaign ? Number(campaign.maxMatchPerDonation) / 10 ** campaign.decimals : amount, pool))}</small></button>)}</div><button className="give" onClick={donate} disabled={busy || campaignEnded || closed}>{busy ? "Preparing your donation…" : campaignEnded ? "Campaign ended" : wallet ? `Give ${selected} ${symbol} · up to ${fmt(selected + estimate)}` : `Connect & give ${selected} ${symbol}`}</button>{isSponsor && campaignEnded && !closed && <button className="reclaim" onClick={reclaimPool} disabled={busy}>{busy ? "Closing campaign…" : "Return remaining pool to sponsor"}</button>}<div className="wallet-note">{campaign ? "Token transfer + match · one atomic transaction" : "Preview only · devnet campaign not configured"}</div>
        {status && <div className={`status ${receipt ? "status-ok" : ""}`}>{status}{receipt && <> <a href={explorerTransaction(receipt)} target="_blank" rel="noreferrer">View receipt ↗</a></>}</div>}
        <div className="match-box"><span className="match-icon">↗</span><div className="match-text"><strong>Every gift gets a boost</strong>Sponsor-funded matching pool · {fmt(pool)} {symbol} left</div></div>
      </aside>
    </section>

    <footer className="bottom"><span>Powered by Solana · Funds stay on-chain</span><div className="bottom-right"><a href="/create">Start a campaign ↗</a>{campaign && <a href={explorerAccount(campaign.address)} target="_blank" rel="noreferrer">Campaign explorer ↗</a>}{actionUrl && <button className="share-button" onClick={copyLink}>{copied ? "Copied" : "Copy Blink link"}</button>}</div></footer>
    {qr && actionUrl && <div className="qr-card"><img src={qr} width="74" height="74" alt="Campaign QR code" /><div><b>Share this campaign</b><button onClick={copyLink}>{copied ? "Link copied" : "Copy action link"}</button></div></div>}
  </main>;
}
