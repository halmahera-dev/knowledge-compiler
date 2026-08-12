import { Chip } from "./primitives";
import type { LabelStyle } from "./style";

/** What the legend is currently narrowing the view to, if anything. */
export type GraphFocus =
	| { kind: "label"; value: string }
	| { kind: "type"; value: string }
	| null;

type GraphLegendProps = {
	labels: { label: string; count: number; style: LabelStyle }[];
	types: { type: string; count: number }[];
	focus: GraphFocus;
	onFocusChange: (focus: GraphFocus) => void;
};

function isActive(focus: GraphFocus, kind: "label" | "type", value: string) {
	return focus?.kind === kind && focus.value === value;
}

export function GraphLegend({
	labels,
	types,
	focus,
	onFocusChange,
}: GraphLegendProps) {
	const toggle = (kind: "label" | "type", value: string) => {
		onFocusChange(isActive(focus, kind, value) ? null : { kind, value });
	};

	return (
		<div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5">
			{labels.map(({ label, count, style }) => (
				<Chip
					key={`label-${label}`}
					active={isActive(focus, "label", label)}
					swatch={style.fill}
					count={count}
					aria-pressed={isActive(focus, "label", label)}
					onClick={() => toggle("label", label)}
				>
					{label}
				</Chip>
			))}

			{labels.length > 0 && types.length > 0 ? (
				<span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
			) : null}

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
		</div>
	);
}
