import { type ReactNode, Suspense } from "react";
import {
  AuthenticatedAppShell,
  AuthenticatedAppShellSkeleton,
} from "@/features/user/components/authenticated-app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AuthenticatedAppShellSkeleton />}>
      <AuthenticatedAppShell>{children}</AuthenticatedAppShell>
    </Suspense>
  );
}
