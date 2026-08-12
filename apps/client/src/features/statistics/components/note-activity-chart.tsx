"use client";

import { Area } from "@/components/dither-kit/area";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";

type NoteActivity = {
	month: string;
	created: number;
	updated: number;
};

const noteActivityConfig = {
	created: { label: "Notes created", color: "blue" as const },
	updated: { label: "Notes revisited", color: "orange" as const },
};

export function NoteActivityChart({ data }: { data: NoteActivity[] }) {
	return (
		<div className="h-72">
			<AreaChart data={data} config={noteActivityConfig} bloom="aura">
				<XAxis dataKey="month" />
				<YAxis />
				<Legend isClickable />
				<Tooltip labelKey="month" />
				<Area dataKey="created" variant="gradient" />
				<Area dataKey="updated" variant="dotted" />
			</AreaChart>
		</div>
	);
}
