import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { MockDraftRoom } from "@/components/mock-draft/mock-draft-room";

export const metadata: Metadata = {
  title: "Mock draft — Playoff Best Ball",
  description: "Practise drafting against bots. Nothing here counts.",
};

export default async function MockDraftPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackURL=/mock-draft");

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <h1 className="chalk chalk-h1 mb-6 text-4xl sm:text-5xl">Mock draft</h1>
        <MockDraftRoom />
      </main>
    </>
  );
}
