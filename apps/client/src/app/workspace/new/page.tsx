import { redirect } from "next/navigation";

import { WorkspaceOnboardingForm } from "@/features/user/components/workspace-onboarding-form";
import { getSession } from "@/features/user/user-queries";

/**
 * The one create-a-workspace form in the app, for the first one and every one
 * after it.
 *
 * It used to bounce anyone who already had a workspace back to "/", which made
 * a second workspace impossible to reach — nothing server-side forbids one, and
 * the "Create one" link on an unsaved turn landed here too.
 */
export default async function WorkspaceNewPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-12 text-center font-bold text-2xl">
          Create a workspace
        </h1>

        <WorkspaceOnboardingForm />
      </div>
    </div>
  );
}
