import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { CreateLeagueForm } from "@/components/create-league-form";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackURL=/leagues/new");
  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-6 text-2xl font-bold">Create your league</h1>
        <CreateLeagueForm />
      </main>
    </>
  );
}
