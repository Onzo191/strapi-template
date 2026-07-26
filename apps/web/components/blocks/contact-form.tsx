"use client";

import type { ContactFormBlock } from "@vng/shared";
import { type FormEvent, useState } from "react";

type FormField = ContactFormBlock["fields"][number];

function renderField(field: FormField) {
  const commonProps = {
    id: field.name,
    name: field.name,
    placeholder: field.placeholder ?? undefined,
    required: field.required,
  };

  if (field.type === "textarea") {
    return <textarea {...commonProps} rows={4} />;
  }
  if (field.type === "select") {
    const options = (field.options ?? "")
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    return (
      <select {...commonProps}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "checkbox") {
    return <input id={field.name} type="checkbox" name={field.name} required={field.required} />;
  }
  return <input type={field.type} {...commonProps} />;
}

/** Newsletter / contact form (§4.2) — the block library's one interactive island. */
export function ContactForm(block: ContactFormBlock) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!block.endpoint) {
      setStatus("success");
      return;
    }
    setStatus("submitting");
    const formData = new FormData(event.currentTarget);
    try {
      const res = await fetch(block.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <section className="vng-section">
        <div className="vng-container" style={{ maxWidth: "36rem" }}>
          <p>{block.successMessage ?? "Thank you!"}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vng-section">
      <div className="vng-container" style={{ maxWidth: "36rem" }}>
        {block.heading && <h2>{block.heading}</h2>}
        {block.description && <p style={{ opacity: 0.75 }}>{block.description}</p>}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {block.fields.map((field) => (
            <label
              key={field.id}
              htmlFor={field.name}
              style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
            >
              <span>
                {field.label}
                {field.required && " *"}
              </span>
              {renderField(field)}
            </label>
          ))}
          <button
            type="submit"
            className="vng-button vng-button--primary"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "…" : block.submitLabel}
          </button>
          {status === "error" && (
            <p style={{ color: "crimson" }}>Something went wrong. Please try again.</p>
          )}
        </form>
      </div>
    </section>
  );
}
