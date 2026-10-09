import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getNotificationSettings } from "@/domain/users/notification-settings";
import { getDigestPreference } from "@/domain/subscribers/account";
import { AppNav } from "@/components/app-nav";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import { DigestToggle } from "@/components/digest-toggle";

export default async function NotificationSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackURL=/settings/notifications");
  const settings = await getNotificationSettings(db, user.id);
  const digest = await getDigestPreference(db, user);
  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-6 text-2xl font-bold">Notifications</h1>
        <NotificationSettingsForm initial={settings} />
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Email</h2>
          <DigestToggle initial={digest} />
        </section>
      </main>
    </>
  );
}
