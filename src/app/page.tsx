import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ChalkPlayDiagram } from "@/components/chalk-play-diagram";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <div className="flex items-center justify-between gap-6">
        <div className="chalk font-chalk text-2xl font-bold text-chalk">Playoff Best Ball</div>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/pricing" className="text-chalk-dim hover:text-chalk hover:underline">
            Pricing
          </Link>
          <Link href="/sign-in" className="text-chalk-dim hover:text-chalk hover:underline">
            Sign in
          </Link>
        </div>
      </div>

      <div className="mt-12 flex flex-col items-start gap-12 lg:mt-20 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex max-w-xl flex-col gap-7">
          <h1 className="chalk chalk-h1 text-6xl sm:text-7xl lg:text-8xl">
            Draft once.
            <br />
            <span className="text-chalk-coral">Watch all</span>
            <br />
            <span className="text-chalk-yellow">playoffs.</span>
          </h1>

          <svg aria-hidden="true" viewBox="0 0 470 26" className="chalk h-5 w-72">
            <path
              d="M 6 17 C 120 5, 250 24, 462 9"
              stroke="var(--chalk-mint)" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".85"
            />
          </svg>

          <p className="text-lg leading-relaxed text-chalk-soft text-pretty sm:text-xl">
            Best ball scoring with your friends, January through the Super Bowl. No lineups to set,
            no waivers to lose sleep over.
          </p>

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/sign-in" className="chalk-btn chalk-btn-primary text-3xl">
              Get started
            </Link>
            <span className="text-sm text-chalk-dim">
              free to play · {formatPriceUsd(PREMIUM_PRICE_CENTS)} for premium
            </span>
          </div>
        </div>

        <ChalkPlayDiagram className="hidden lg:block" />
      </div>

      <p className="mt-16 text-sm text-chalk-dim">
        Drawn on the driveway, scored by the box score.
      </p>
    </main>
  );
}
