import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Playoff Best Ball</h1>
      <p className="text-lg text-gray-600">
        Draft once. Watch all playoffs. Best ball scoring with your friends, January through the
        Super Bowl.
      </p>
      <Link
        href="/sign-in"
        className="rounded-lg bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
      >
        Get started
      </Link>
    </main>
  );
}
