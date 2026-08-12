"use client";

import { Cursor02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@kc/ui/components/empty";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AgentThreadMenu } from "@/features/agent/components/agent-thread-menu";
import { ChatInput } from "@/features/agent/components/chat-input";
import { ChatSuggestions } from "@/features/agent/components/chat-suggestions";
import { setPendingMessage } from "@/features/agent/pending-message";
import { authClient } from "@/features/user/user-client";

export default function AgentPage() {
  const [input, setInput] = useState("");
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const firstName = session?.user.name.split(" ")[0] ?? "there";

  function handleSubmit() {
    const text = input.trim();
    if (!text) return;

    const threadId = crypto.randomUUID();
    setPendingMessage(threadId, text);
    router.push(`/agent/${threadId}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <PageHeader>
        <AgentThreadMenu threadId={null} />
      </PageHeader>
      <div className="fade-in-0 slide-in-from-bottom-1 mx-auto flex w-full max-w-3xl flex-1 animate-in flex-col items-center justify-center gap-2 px-4 pb-12 duration-200">
        <Empty className="flex-none space-y-4 border-none">
          <EmptyHeader className="max-w-2xl!">
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Cursor02Icon} />
            </EmptyMedia>
            <EmptyTitle className="mb-2 text-4xl">
              Burning midnight tokens, {firstName}?
            </EmptyTitle>
            <EmptyDescription>
              What are we working on today? Press send to start a new
              conversation
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="mt-2 max-w-2xl space-y-2">
            <ChatInput
              onChange={setInput}
              onSubmit={handleSubmit}
              value={input}
            />
            <ChatSuggestions onSelect={setInput} />
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
