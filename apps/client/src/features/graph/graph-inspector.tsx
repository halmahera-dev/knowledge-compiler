import { EyeOff, Network, Pin, PinOff, X } from "lucide-react";
import { IconButton, TextButton } from "./primitives";
import {
	communityName,
	communityOf,
	communityStyleFor,
	formatPropertyValue,
	nodeCaption,
	primaryLabel,
} from "./style";
import type {
	PropertyValue,
	SimulationNode,
	SimulationRelationship,
} from "./types";

type InspectorTarget =
	| { kind: "node"; node: SimulationNode; hiddenNeighbourCount: number }
	| { kind: "relationship"; relationship: SimulationRelationship };

type GraphInspectorProps = {
	target: InspectorTarget;
	onClose: () => void;
	onExpand: (id: string) => void;
	onDismiss: (id: string) => void;
	onTogglePin: (id: string) => void;
};

function PropertyList({
	properties,
}: {
	properties: Record<string, PropertyValue>;
}) {
	const entries = Object.entries(properties);

	if (entries.length === 0) {
		return (
			<p className="px-3 py-2 text-muted-foreground text-xs">No properties</p>
		);
	}

	return (
		<dl className="divide-y divide-border text-xs">
			{entries.map(([key, value]) => (
				<div key={key} className="grid grid-cols-[7rem_1fr] gap-2 px-3 py-2">
					<dt className="truncate font-medium text-muted-foreground">{key}</dt>
					<dd className="min-w-0 break-words font-mono text-[11px] leading-relaxed">
						{formatPropertyValue(value)}
					</dd>
				</div>
			))}
		</dl>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="px-3 pt-3 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
			{children}
		</h3>
	);
}

export function GraphInspector({
	target,
	onClose,
	onExpand,
	onDismiss,
	onTogglePin,
}: GraphInspectorProps) {
	const isNode = target.kind === "node";
	const heading = isNode ? nodeCaption(target.node) : target.relationship.type;

	return (
		<aside
			aria-label={isNode ? "Node details" : "Relationship details"}
			className="pointer-events-auto flex max-h-full w-72 flex-col overflow-hidden rounded-lg border border-border bg-card/60 shadow-md backdrop-blur-2xl"
		>
			<header className="flex items-start gap-2 border-border border-b px-3 py-2.5">
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm" title={heading}>
						{heading}
					</p>
					<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
						{isNode
							? `<id> ${target.node.id}`
							: `<id> ${target.relationship.id}`}
					</p>
				</div>

				<IconButton
					aria-label="Close details"
					className="-mt-0.5 size-7 border-transparent shadow-none"
					onClick={onClose}
				>
					<X />
				</IconButton>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{isNode ? (
					<>
						{/* The canvas colours by cluster now, so this says which one —
						    and the label chips below stop borrowing that palette, which
						    would claim the colour meant "Topic" or "Concept". */}
						<SectionTitle>Cluster</SectionTitle>
						<div className="flex items-center gap-2 px-3 pb-2">
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-full"
								style={{
									backgroundColor: communityStyleFor(communityOf(target.node))
										.fill,
								}}
							/>
							<span className="font-medium text-xs">
								{communityName(communityOf(target.node))}
							</span>
						</div>

						<SectionTitle>Labels</SectionTitle>
						<div className="flex flex-wrap gap-1.5 px-3 pb-1">
							{target.node.labels.map((label) => (
								<span
									key={label}
									className={
										label === primaryLabel(target.node)
											? "inline-flex h-5 items-center rounded-full bg-muted px-2 font-medium text-[11px]"
											: "inline-flex h-5 items-center rounded-full border border-border px-2 font-medium text-[11px] text-muted-foreground"
									}
								>
									{label}
								</span>
							))}
						</div>
					</>
				) : (
					<>
						<SectionTitle>Direction</SectionTitle>
						<p className="flex flex-wrap items-center gap-1 px-3 pb-1 text-xs">
							<span className="font-medium">
								{nodeCaption(target.relationship.source)}
							</span>
							<span className="text-muted-foreground">→</span>
							<span className="font-medium">
								{nodeCaption(target.relationship.target)}
							</span>
						</p>
					</>
				)}

				<SectionTitle>Properties</SectionTitle>
				<PropertyList
					properties={
						isNode ? target.node.properties : target.relationship.properties
					}
				/>
			</div>

			{isNode ? (
				<footer className="flex flex-wrap items-center gap-1.5 border-border border-t px-3 py-2.5">
					<TextButton
						disabled={target.hiddenNeighbourCount === 0}
						title={
							target.hiddenNeighbourCount === 0
								? "All neighbours are already shown"
								: `Reveal ${target.hiddenNeighbourCount} connected node(s)`
						}
						onClick={() => onExpand(target.node.id)}
					>
						<Network />
						Expand
						{target.hiddenNeighbourCount > 0
							? ` (${target.hiddenNeighbourCount})`
							: ""}
					</TextButton>

					<TextButton onClick={() => onTogglePin(target.node.id)}>
						{target.node.fx === null ? <Pin /> : <PinOff />}
						{target.node.fx === null ? "Pin" : "Unpin"}
					</TextButton>

					<TextButton onClick={() => onDismiss(target.node.id)}>
						<EyeOff />
						Dismiss
					</TextButton>
				</footer>
			) : null}
		</aside>
	);
}
