import MarketingLanding from "@/components/MarketingLanding";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "AI Micro-Lessons for Busy Learners",
  description:
    "Personalized AI lessons, instant quizzes, and adaptive pacing help you master any topic faster with Lernex.",
  path: "/",
  openGraph: {
    type: "website",
  },
});

export default function LandingPage() {
  return <MarketingLanding />;
}
