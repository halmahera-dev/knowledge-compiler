import { CaptureView } from "@/features/capture/components/capture-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Capture" };

export default function CapturePage() {
	return <CaptureView />;
}
