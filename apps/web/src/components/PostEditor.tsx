import { createPostSchema, type CreatePostInput } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { errorsFromApi, type FieldErrors, validate } from "../forms";
import { renderMarkdown } from "../markdown";
import { Field } from "./Field";

interface PostEditorProps {
  initial?: CreatePostInput;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: CreatePostInput, onError: (err: unknown) => void) => void;
}

export function PostEditor({
  initial = { title: "", body: "" },
  submitLabel,
  pending,
  onSubmit,
}: PostEditorProps) {
  const [values, setValues] = useState(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: keyof CreatePostInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(createPostSchema, values);
    if (!data) {
      setErrors(invalid);
      return;
    }
    onSubmit(data, (err) => {
      const { fields, form } = errorsFromApi(err);
      setErrors(fields);
      setFormError(form);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field
        label="Title"
        value={values.title}
        maxLength={120}
        onChange={(e) => {
          update("title", e.target.value);
        }}
        error={errors.title}
        hint="Your point in one line"
      />

      <div className="field">
        <div className="editor-tabs" role="tablist">
          <label htmlFor="post-body">Your reasoning</label>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "write"}
            onClick={() => {
              setTab("write");
            }}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            onClick={() => {
              setTab("preview");
            }}
          >
            Preview
          </button>
        </div>
        {tab === "write" ? (
          <textarea
            id="post-body"
            rows={12}
            maxLength={10000}
            value={values.body}
            aria-invalid={errors.body ? true : undefined}
            onChange={(e) => {
              update("body", e.target.value);
            }}
          />
        ) : (
          <div
            className="markdown preview"
            // Sanitized by renderMarkdown (DOMPurify).
            dangerouslySetInnerHTML={{
              __html:
                renderMarkdown(values.body) || "<p>Nothing to preview yet.</p>",
            }}
          />
        )}
        {errors.body ? (
          <p className="field-error">{errors.body}</p>
        ) : (
          <p className="field-hint">
            Markdown works: **bold**, _italic_, [links](https://…), lists and
            &gt; quotes.
          </p>
        )}
      </div>

      {formError && <p className="form-error">{formError}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
