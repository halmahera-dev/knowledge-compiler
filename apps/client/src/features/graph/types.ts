/**
 * Neo4j-flavoured graph shapes. A driver result maps onto these one-to-one:
 * a node's `identity`/`labels`/`properties` and a relationship's
 * `type`/`start`/`end`.
 */

export type PropertyValue =
	| string
	| number
	| boolean
	| null
	| string[]
	| number[];

export type GraphNode = {
	id: string;
	labels: string[];
	properties: Record<string, PropertyValue>;
};

export type GraphRelationship = {
	id: string;
	type: string;
	startNodeId: string;
	endNodeId: string;
	properties: Record<string, PropertyValue>;
};

export type GraphData = {
	nodes: GraphNode[];
	relationships: GraphRelationship[];
};

/** A node once the force simulation owns it. Mutated in place every tick. */
export type SimulationNode = GraphNode & {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Non-null while the node is pinned, by a drag or by the user. */
	fx: number | null;
	fy: number | null;
	radius: number;
	degree: number;
};

export type SimulationRelationship = GraphRelationship & {
	source: SimulationNode;
	target: SimulationNode;
	/** Position within the bundle of relationships joining the same node pair. */
	parallelIndex: number;
	parallelCount: number;
	/** True when this relationship runs against the pair's canonical id order. */
	reversed: boolean;
};

export type GraphSelection =
	| { kind: "node"; id: string }
	| { kind: "relationship"; id: string }
	| null;

export type Viewport = {
	x: number;
	y: number;
	k: number;
};

export type Size = {
	width: number;
	height: number;
};
