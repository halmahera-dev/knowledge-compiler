"use client";

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * It replaces the whole document, so unlike every other boundary it has to
 * render its own <html> and <body> — and it cannot rely on the app's providers,
 * fonts, or theme having loaded, which is why the styling here is inline.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
	return (
		<html lang="en">
			<body
				style={{
					display: "grid",
					placeItems: "center",
					minHeight: "100svh",
					margin: 0,
					fontFamily: "system-ui, sans-serif",
					padding: "1.25rem",
				}}
			>
				<div style={{ maxWidth: "28rem", textAlign: "center" }}>
					<h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
						The app failed to start.
					</h1>
					<p style={{ marginTop: "0.75rem", lineHeight: 1.6, opacity: 0.75 }}>
						Nothing you saved was lost. Reloading usually clears this.
					</p>
					<button
						type="button"
						onClick={retry}
						style={{
							marginTop: "1.5rem",
							padding: "0.6rem 1.1rem",
							borderRadius: "0.5rem",
							border: "1px solid currentColor",
							background: "transparent",
							font: "inherit",
							cursor: "pointer",
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
