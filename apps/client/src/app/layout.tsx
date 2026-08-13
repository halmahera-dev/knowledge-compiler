import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "../index.css";

export const metadata: Metadata = {
  // Leaf first: "Capture · Knowledge Compiler" reads better in a crowded tab
  // strip, where the first few characters are all that survive truncation.
  title: {
    template: "%s · Knowledge Compiler",
    default: "Knowledge Compiler",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
