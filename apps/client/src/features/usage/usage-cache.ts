export const usageKeys = {
	list: (params: { days?: number; operation?: string; limit?: number }) =>
		["usage", "list", params] as const,
};
