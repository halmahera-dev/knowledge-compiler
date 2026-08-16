import { IceCubesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/features/user/components/login-form";

export default function LoginPage() {
	return (
		<div className="grid min-h-svh lg:grid-cols-12">
			<div className="col-span-7 flex flex-col gap-4 p-6 md:p-10">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 font-medium">
						<HugeiconsIcon icon={IceCubesIcon} className="size-4" />
						Traversa
					</div>
					{/* The way out. Without it the only exits from this page are the
              browser's Back button and signing in. */}
					<Link
						href="/landing"
						className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline"
					>
						&larr; Back
					</Link>
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-sm">
						<div className="mb-6 flex flex-col items-center gap-1 text-center">
							<h1 className="font-bold text-2xl">Login to your account</h1>
							<p className="text-balance text-muted-foreground text-sm">
								Enter your email below to login to your account
							</p>
						</div>
						{/* The form reads `?redirect` through useSearchParams, which
                bails out of prerendering. Without a boundary the build fails
                outright rather than degrading. */}
						<Suspense fallback={null}>
							<LoginForm />
						</Suspense>
					</div>
				</div>
			</div>
			<div className="relative col-span-5 m-4 hidden rounded-4xl bg-muted lg:block">
				<Image
					src="/magic.webp"
					alt="Login"
					fill
					preload
					sizes="42vw"
					className="absolute inset-0 h-full w-full rounded-4xl object-cover object-right dark:brightness-[0.6]"
				/>
			</div>
		</div>
	);
}
