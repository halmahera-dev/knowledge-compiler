"use client";

import {
  ChatAdd01Icon,
  ChevronDown,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@kc/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kc/ui/components/dropdown-menu";
import { Skeleton } from "@kc/ui/components/skeleton";
import { cn } from "@kc/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  useDeleteThread,
  useRenameThread,
  useThreads,
} from "@/features/agent/hooks/use-agent-threads";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Compact age like the ones shown in Linear's thread switcher: "2w", "15d", "3h". */
function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / DAY_MS);
  if (days >= 14) return `${Math.floor(days / 7)}w`;
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.max(1, Math.floor(ms / (60 * 1000)));
  return `${minutes}m`;
}

export function AgentThreadMenu({ threadId }: { threadId: string | null }) {
  const { data: threads, isPending } = useThreads();
  const deleteThread = useDeleteThread();
  const renameThread = useRenameThread();
  const router = useRouter();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const current = threads?.find((thread) => thread.id === threadId);
  const label = current?.title ?? "New chat";

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  function startRename(id: string, title: string | undefined) {
    setRenamingId(id);
    setRenameValue(title ?? "");
  }

  function commitRename() {
    const title = renameValue.trim();
    if (renamingId && title) {
      renameThread.mutate({ id: renamingId, title });
    }
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setRenamingId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 max-w-64 rounded-full"
          >
            <span className="truncate">{label}</span>
            <HugeiconsIcon icon={ChevronDown} className="shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem render={<Link href="/agent" />}>
          <HugeiconsIcon icon={ChatAdd01Icon} />
          New chat
        </DropdownMenuItem>

        {(threads?.length ?? 0) > 0 && <DropdownMenuSeparator />}

        {isPending &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="px-3 py-2">
              <Skeleton className="h-2 w-full" />
            </div>
          ))}

        {threads?.map((thread) =>
          renamingId === thread.id ? (
            <div key={thread.id} className="flex items-center gap-2 px-3 py-1">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 rounded-sm border border-input bg-transparent px-1.5 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <DropdownMenuItem
              key={thread.id}
              className={cn(
                "group/thread-item justify-between gap-2",
                thread.id === threadId && "bg-muted",
              )}
              render={<Link href={`/agent/${thread.id}`} />}
            >
              <span className="min-w-0 flex-1 truncate">
                {thread.title ?? "Untitled conversation"}
              </span>
              <div className="grid shrink-0 place-items-center">
                <span className="col-start-1 row-start-1 text-muted-foreground text-xs opacity-100 transition-opacity group-hover/thread-item:opacity-0">
                  {relativeAge(thread.updatedAt)}
                </span>
                <div className="pointer-events-none col-start-1 row-start-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/thread-item:pointer-events-auto group-hover/thread-item:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startRename(thread.id, thread.title);
                    }}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="size-3" />
                    <span className="sr-only">Rename conversation</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteThread.mutate(thread.id, {
                        onSuccess: () => {
                          if (thread.id === threadId) router.push("/agent");
                        },
                      });
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                    <span className="sr-only">Delete conversation</span>
                  </Button>
                </div>
              </div>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
