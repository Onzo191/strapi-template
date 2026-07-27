"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@vng/design-system";
import type { ContactFormBlock } from "@vng/shared";
import { useMemo, useState } from "react";
import { type DefaultValues, useForm } from "react-hook-form";
import { z } from "zod";

type FieldDef = ContactFormBlock["fields"][number];

function fieldSchema(field: FieldDef) {
  if (field.type === "checkbox") {
    return field.required
      ? z.boolean().refine((value) => value === true, { message: "This field is required" })
      : z.boolean().optional().default(false);
  }
  const base =
    field.type === "email" ? z.string().email("Enter a valid email address") : z.string();
  return field.required ? base.min(1, "This field is required") : base.optional().default("");
}

/** Built fresh per block instance — the CMS defines the fields, so the schema can't be static. */
function buildSchema(fields: FieldDef[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field.name, fieldSchema(field)])));
}

function selectOptions(field: FieldDef) {
  return (field.options ?? "")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

function initialValues(fields: FieldDef[]): Record<string, string | boolean> {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.type === "checkbox" ? false : ""]),
  );
}

/** Newsletter / contact form (§4.2) — RHF + Zod, reusing `ContactFormBlock`'s CMS-defined fields. */
export function ContactForm(block: ContactFormBlock) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const schema = useMemo(() => buildSchema(block.fields), [block.fields]);
  // Zod's input type (pre-default, e.g. optional string may be `undefined`) is what RHF
  // stores per-field; the output type (post-default/refine) is what the resolver hands
  // to `onSubmit` — the two differ whenever a field is optional, hence three generics.
  type InputValues = z.input<typeof schema>;
  type OutputValues = z.output<typeof schema>;

  const form = useForm<InputValues, unknown, OutputValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(block.fields) as DefaultValues<InputValues>,
  });

  async function onSubmit(values: OutputValues) {
    if (!block.endpoint) {
      setStatus("success");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch(block.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-xl px-6">
          <p>{block.successMessage ?? "Thank you!"}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-xl px-6">
        {block.heading && (
          <h2 className="text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        {block.description && <p className="mt-2 text-muted-foreground">{block.description}</p>}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5">
            {block.fields.map((fieldDef) => (
              <FormField
                key={fieldDef.id}
                control={form.control}
                name={fieldDef.name}
                render={({ field }) => (
                  <FormItem>
                    {fieldDef.type !== "checkbox" && (
                      <FormLabel>
                        {fieldDef.label}
                        {fieldDef.required && " *"}
                      </FormLabel>
                    )}
                    {fieldDef.type === "textarea" ? (
                      <FormControl>
                        <Textarea
                          rows={4}
                          placeholder={fieldDef.placeholder ?? undefined}
                          {...field}
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                    ) : fieldDef.type === "select" ? (
                      // `Select` (Radix Root) renders no DOM node of its own, so `FormControl`
                      // must wrap `SelectTrigger` (the actual button) directly — wrapping
                      // `Select` itself would leave the id/aria-describedby it injects with
                      // nowhere to land, breaking the label association (and the accessible
                      // name Lighthouse's `button-name` audit checks for).
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={String(field.value ?? "")}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={fieldDef.placeholder ?? undefined} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectOptions(fieldDef).map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : fieldDef.type === "checkbox" ? (
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Checkbox
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {fieldDef.label}
                          {fieldDef.required && " *"}
                        </FormLabel>
                      </div>
                    ) : (
                      <FormControl>
                        <Input
                          type={fieldDef.type}
                          placeholder={fieldDef.placeholder ?? undefined}
                          {...field}
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <Button type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "…" : block.submitLabel}
            </Button>
            {status === "error" && (
              <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
            )}
          </form>
        </Form>
      </div>
    </section>
  );
}
