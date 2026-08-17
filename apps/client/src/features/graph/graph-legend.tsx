import { ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@kc/ui/components/dropdown-menu";
import { Chip } from "./primitives";
import type { LabelStyle } from "./style";

/** What the legend is currently narrowing the view to, if anything. */
export type GraphFocus =
	| { kind: "community"; value: string }
	| { kind: "type"; value: string }
	| null;

type GraphLegendProps = {
	communities: { name: string; count: number; style: LabelStyle }[];
	types: { type: string; count: number }[];
	focus: GraphFocus;
	onFocusChange: (focus: GraphFocus) => void;
	/** 0–1. Relationships weaker than this are not drawn. */
	minStrength: number;
	onMinStrengthChange: (value: number) => void;
	hiddenRelationshipCount: number;
};

function isActive(
	focus: GraphFocus,
	kind: "community" | "type",
	value: string,
) {
	return focus?.kind === kind && focus.value === value;
}

/**
 * Hide the weaker connections.
 *
 * A native range input rather than a component: this app has no slider
 * primitive, and one control does not earn a new one in `@kc/ui`. `accent-color`
 * puts it in the product's indigo without restyling the track.
 */
function StrengthFilter({
	value,
	onChange,
	hiddenCount,
}: {
	value: number;
	onChange: (value: number) => void;
	hiddenCount: number;
}) {
	return (
		<div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 shadow-xs backdrop-blur-md">
			<label
				htmlFor="graph-strength"
				className="whitespace-nowrap font-medium text-muted-foreground text-xs"
			>
				Links
			</label>
			<input
				id="graph-strength"
				type="range"
				min={0}
				max={1}
				step={0.05}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className="h-1 w-24 cursor-pointer accent-primary"
			/>
			<span className="w-8 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums">
				{value.toFixed(2)}
			</span>
			{hiddenCount > 0 ? (
				<span className="whitespace-nowrap text-muted-foreground text-xs">
					· {hiddenCount} hidden
				</span>
			) : null}
		</div>
	);
}

export function GraphLegend({
	communities,
	types,
	focus,
	onFocusChange,
	minStrength,
	onMinStrengthChange,
	hiddenRelationshipCount,
}: GraphLegendProps) {
	const toggle = (kind: "community" | "type", value: string) => {
		onFocusChange(isActive(focus, kind, value) ? null : { kind, value });
	};

	const activeCommunity = communities.find((c) =>
		isActive(focus, "community", c.name),
	);

	return (
		<div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5">
			{/* Communities dropdown */}
			{communities.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 font-medium text-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							{activeCommunity ? (
								<>
									<span
										aria-hidden="true"
										className="size-2.5 shrink-0 rounded-full"
										style={{ backgroundColor: activeCommunity.style.fill }}
									/>
									<span className="truncate">{activeCommunity.name}</span>
									<span className="tabular-nums opacity-60">
										{activeCommunity.count}
									</span>
								</>
							) : (
								<span>Communities</span>
							)}
							<ChevronDown className="size-3 shrink-0 opacity-60" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" sideOffset={4}>
						{communities.map(({ name, count, style }) => (
							<DropdownMenuItem
								key={`community-${name}`}
								onClick={() => toggle("community", name)}
							>
								<span
									aria-hidden="true"
									className="size-2.5 shrink-0 rounded-full"
									style={{ backgroundColor: style.fill }}
								/>
								<span className="flex-1 truncate">{name}</span>
								<span className="tabular-nums opacity-60">{count}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}

			{communities.length > 0 && types.length > 0 ? (
				<span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
			) : null}

			{/* Type chips stay inline */}
			{types.map(({ type, count }) => (
				<Chip
					key={`type-${type}`}
					active={isActive(focus, "type", type)}
					count={count}
					aria-pressed={isActive(focus, "type", type)}
					onClick={() => toggle("type", type)}
				>
					{type}
				</Chip>
			))}

			{types.length > 0 ? (
				<StrengthFilter
					value={minStrength}
					onChange={onMinStrengthChange}
					hiddenCount={hiddenRelationshipCount}
				/>
			) : null}
		</div>
	);
}
