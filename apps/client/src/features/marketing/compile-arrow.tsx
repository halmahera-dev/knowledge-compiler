"use client";

/**
 * Animated arrows flowing from three source cards to a wiki page.
 *
 * Three paths converge from left/center/right to a single point.
 * A pulse travels along each path in sequence.
 */

export function CompileArrow() {
	return (
		<div className="flex items-center justify-center py-6">
			<svg
				viewBox="0 0 400 80"
				className="w-full max-w-md"
				fill="none"
				aria-hidden="true"
			>
				{/* Path 1: left source → center */}
				<path
					d="M60,10 Q60,45 200,70"
					stroke="currentColor"
					strokeWidth="1.5"
					className="text-border"
				/>
				{/* Path 2: center source → center */}
				<path
					d="M200,10 L200,70"
					stroke="currentColor"
					strokeWidth="1.5"
					className="text-border"
				/>
				{/* Path 3: right source → center */}
				<path
					d="M340,10 Q340,45 200,70"
					stroke="currentColor"
					strokeWidth="1.5"
					className="text-border"
				/>

				{/* Animated pulses */}
				<circle r="4" className="fill-primary">
					<animateMotion
						dur="2s"
						repeatCount="indefinite"
						path="M60,10 Q60,45 200,70"
					/>
				</circle>
				<circle r="4" className="fill-primary">
					<animateMotion
						dur="2s"
						repeatCount="indefinite"
						begin="0.4s"
						path="M200,10 L200,70"
					/>
				</circle>
				<circle r="4" className="fill-primary">
					<animateMotion
						dur="2s"
						repeatCount="indefinite"
						begin="0.8s"
						path="M340,10 Q340,45 200,70"
					/>
				</circle>

				{/* Convergence point */}
				<circle cx="200" cy="70" r="6" className="fill-primary/30" />
				<circle cx="200" cy="70" r="3" className="fill-primary" />
			</svg>
		</div>
	);
}
