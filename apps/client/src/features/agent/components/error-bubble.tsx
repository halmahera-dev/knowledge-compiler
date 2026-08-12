import { Bubble, BubbleContent } from "@kc/ui/components/bubble";
import { Button } from "@kc/ui/components/button";
import { Message, MessageContent } from "@kc/ui/components/message";
import { RotateCcwIcon } from "lucide-react";

export function ErrorBubble({
	error,
	onRetry,
}: {
	error: Error;
	onRetry: () => void;
}) {
	return (
		<Message align="start">
			<MessageContent>
				<Bubble variant="ghost">
					<BubbleContent className="flex flex-col gap-2">
						<p>
							Something went wrong while generating a response
							{error.message ? `: ${error.message}` : "."}
						</p>
						<Button
							className="self-start"
							onClick={onRetry}
							size="sm"
							variant="outline"
						>
							<RotateCcwIcon />
							Retry
						</Button>
					</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}
