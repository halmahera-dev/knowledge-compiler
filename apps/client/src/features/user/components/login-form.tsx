"use client";

import { LoaderPinwheelFreeIcons } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@kc/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@kc/ui/components/field";
import { Input } from "@kc/ui/components/input";
import { cn } from "@kc/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "../user-client";
import { clearApiToken } from "../user-token";
import { safeRedirect } from "@/lib/redirects";

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"form">) {
	const router = useRouter();
	// Where the visitor was heading before the sign-in detour. Attacker-
	// controllable, so it is filtered to a path on this origin before it is
	// followed — this is navigated to immediately after a password is typed.
	const destination = safeRedirect(useSearchParams().get("redirect"));

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validators: {
			onSubmit: z.object({
				email: z.email(""),
				password: z.string().min(1, "Password is required"),
			}),
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: () => {
						// A token cached before this sign-in belongs to whoever was
						// here last; without this the first request is made as them.
						clearApiToken();
						router.push(destination);
						router.refresh();

						toast.success("Signed in successfully");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
	});

	return (
		<form
			className={cn("flex flex-col gap-6", className)}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			{...props}
		>
			<FieldGroup>
				<form.Field name="email">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;

						return (
							<Field>
								<FieldLabel htmlFor={field.name}>Email</FieldLabel>

								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									placeholder="m@example.com"
									autoComplete="email"
								/>

								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

				<form.Field name="password">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;

						return (
							<Field>
								{/* No "Forgot your password?" link: nothing in this repo can
										send an email, so it led to a page that said the words and
										did nothing. An offer that cannot be honoured is worse than
										its absence — it costs the reader an attempt to recover. */}
								<FieldLabel htmlFor={field.name}>Password</FieldLabel>

								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
								/>

								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Field>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? (
									<>
										<HugeiconsIcon
											icon={LoaderPinwheelFreeIcons}
											className="animate-spin"
										/>
										<span>Signing in...</span>
									</>
								) : (
									"Login"
								)}
							</Button>
						</Field>
					)}
				</form.Subscribe>

				<Field>
					<FieldDescription className="text-center">
						Don&apos;t have an account?{" "}
						<Link href="/register" className="underline underline-offset-4">
							Sign up
						</Link>
					</FieldDescription>
				</Field>
			</FieldGroup>
		</form>
	);
}
