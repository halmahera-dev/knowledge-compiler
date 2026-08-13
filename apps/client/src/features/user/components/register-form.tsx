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

export function RegisterForm({
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
			name: "",
			email: "",
			password: "",
			passwordConf: "",
		},
		validators: {
			onSubmit: z
				.object({
					name: z.string().min(1, "Name is required"),
					email: z.email("Email is required"),
					password: z.string().min(1, "Password is required"),
					passwordConf: z.string().min(1, "Password confirmation is required"),
				})
				.refine((value) => value.password === value.passwordConf, {
					message: "Passwords must match",
					path: ["passwordConf"],
				}),
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					name: value.name,
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: () => {
						// See login-form: a stale token outlives the session it came from.
						clearApiToken();
						router.push(destination);
						router.refresh();

						toast.success("Account created successfully");
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
				<form.Field name="name">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;

						return (
							<Field>
								<FieldLabel htmlFor={field.name}>Name</FieldLabel>

								<Input
									id={field.name}
									name={field.name}
									type="text"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									placeholder="Jane Doe"
									autoComplete="name"
								/>

								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

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
								<FieldLabel htmlFor={field.name}>Password</FieldLabel>

								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									autoComplete="new-password"
								/>

								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

				<form.Field name="passwordConf">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;

						return (
							<Field>
								<FieldLabel htmlFor={field.name}>Confirm password</FieldLabel>

								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									autoComplete="new-password"
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
										<span>Creating account...</span>
									</>
								) : (
									"Register"
								)}
							</Button>
						</Field>
					)}
				</form.Subscribe>

				<Field>
					<FieldDescription className="text-center">
						I already have an account{" "}
						<Link href="/login" className="underline underline-offset-4">
							Sign in
						</Link>
					</FieldDescription>
				</Field>
			</FieldGroup>
		</form>
	);
}
