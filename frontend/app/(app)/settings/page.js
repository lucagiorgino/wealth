import { connection } from "next/server";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function Settings() {
  await connection();
  await requireSession();
  let settings;
  let failure;
  try {
    settings = await getSettings();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    console.error("Settings request failed", { status: error.status });
    failure = error.message;
  }
  return (
    <>
      <PageHeading
        eyebrow="Your workspace"
        title="Settings"
        description="Choose your appearance and put your most-used features first."
      />
      {failure ? (
        <Feedback state={{ error: failure }} />
      ) : (
        <SettingsForm settings={settings} />
      )}
    </>
  );
}
