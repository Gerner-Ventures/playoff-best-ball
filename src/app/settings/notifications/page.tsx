import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getNotificationSettings } from "@/domain/users/notification-settings";
import { AppNav } from "@/components/app-nav";
import { NotificationSettingsForm } from "@/components/notification-settings-form";

export default async function NotificationSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackURL=/settings/notifications");
  const settings = await getNotificationSettings(db, user.id);
  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-6 text-2xl font-bold">Notifications</h1>
        <NotificationSettingsForm initial={settings} />
      </main>
    </>
  );
}
