import { Bubble, BubbleContent } from "@kc/ui/components/bubble";
import { Message, MessageContent } from "@kc/ui/components/message";
import { TextShimmer } from "@/features/agent/components/text-shimmer";

export function PendingBubble() {
	return (
		<Message align="start">
			<MessageContent>
				<Bubble variant="ghost">
					<BubbleContent>
						<TextShimmer>Thinking…</TextShimmer>
					</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}
