import { redirect } from "next/navigation";

import { WorkspaceOnboardingForm } from "@/features/user/components/workspace-onboarding-form";
import { getSession, listOrganizations } from "@/features/user/user-queries";

export default async function WorkspaceNewPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const organizations = await listOrganizations();
  if (organizations.length > 0) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-12 text-center font-bold text-2xl">
          Create your workspace
        </h1>

        <WorkspaceOnboardingForm />
      </div>
    </div>
  );
}
