"use client";

import { Button } from "@kc/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@kc/ui/components/field";
import { Input } from "@kc/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "../user-client";

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "workspace";

  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export function WorkspaceOnboardingForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: { name: "" },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "Workspace name is required"),
      }),
    },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.organization.create({
        name: value.name,
        slug: slugify(value.name),
      });

      if (error || !data) {
        toast.error(error?.message ?? "Could not create workspace");
        return;
      }

      await authClient.organization.setActive({ organizationId: data.id });
      queryClient.clear();
      router.push("/");
      router.refresh();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="name">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field>
                <FieldLabel htmlFor={field.name}>Workspace name</FieldLabel>

                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Reading list, Thesis…"
                  autoFocus
                />

                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Field>
              <Button
                variant="secondary"
                type="submit"
                disabled={isSubmitting}
                className="mt-4"
              >
                {isSubmitting ? "Creating workspace..." : "Create workspace"}
              </Button>
            </Field>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
}
