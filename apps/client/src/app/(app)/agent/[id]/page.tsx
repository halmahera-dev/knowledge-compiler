import { AgentChat } from "@/features/agent/components/agent-chat";

export default async function AgentThreadPage({
  params,
}: PageProps<"/agent/[id]">) {
  return params.then(({ id }) => <AgentChat threadId={id} />);
}
