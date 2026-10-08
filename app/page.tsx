import MatchLinkApp from "./ui";

export default async function Home({ searchParams }: { searchParams: Promise<{ campaign?: string; title?: string; description?: string; goal?: string }> }) {
  const params = await searchParams;
  return <MatchLinkApp
    campaignAddress={params.campaign || process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS || ""}
    campaignTitle={params.title || "Open-source for everyone"}
    campaignDescription={params.description || "Help independent builders turn useful ideas into public goods. Every contribution moves the project forward — and our sponsor adds a match from a dedicated pool, automatically."}
    campaignGoal={params.goal || "500"}
  />;
}
