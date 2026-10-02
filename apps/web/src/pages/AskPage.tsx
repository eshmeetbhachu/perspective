import { createQuestionSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useCurrentUser, useResendVerification } from "../auth";
import { Field } from "../components/Field";
import { errorsFromApi, type FieldErrors, validate } from "../forms";
import { useAskQuestion, useSimilarQuestions } from "../questions";

export function AskPage() {
  const { data: user } = useCurrentUser();
  const ask = useAskQuestion();
  const resend = useResendVerification();
  const navigate = useNavigate();
  const [values, setValues] = useState({ title: "", description: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const similar = useSimilarQuestions(values.title);

  if (!user) return null;

  if (!user.emailVerified) {
    return (
      <section className="card">
        <h1>Verify your email first</h1>
        <p className="muted">
          To keep questions spam-free, only verified accounts can ask. Open the
          link we emailed to {user.email}.
        </p>
        {resend.isSuccess ? (
          <p className="notice">Sent. Check your inbox.</p>
        ) : (
          <button
            type="button"
            className="button"
            disabled={resend.isPending}
            onClick={() => {
              resend.mutate();
            }}
          >
            Send the link again
          </button>
        )}
      </section>
    );
  }

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(createQuestionSchema, values);
    if (!data) {
      setErrors(invalid);
      return;
    }

    ask.mutate(data, {
      onSuccess: ({ question }) => {
        void navigate(`/q/${question.slug}`);
      },
      onError: (err) => {
        const { fields, form } = errorsFromApi(err);
        setErrors(fields);
        setFormError(form);
      },
    });
  }

  const matches =
    values.title.trim().length >= 5 ? similar.data?.questions : [];

  return (
    <section className="card card-wide">
      <h1>Ask a question</h1>
      <p className="muted">
        Phrase it so people can genuinely answer For, Neutral or Against.
        “Should cities ban cars downtown?” works; “Why are cars ruining cities?”
        doesn't.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Question"
          value={values.title}
          maxLength={150}
          onChange={(e) => {
            update("title", e.target.value);
          }}
          error={errors.title}
          hint="10–150 characters, ending with a question mark"
        />

        {matches && matches.length > 0 && (
          <div className="similar" aria-live="polite">
            <p className="similar-title">Did you mean one of these?</p>
            <ul>
              {matches.map((question) => (
                <li key={question.id}>
                  <Link to={`/q/${question.slug}`}>{question.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="field">
          <label htmlFor="description">Context (optional)</label>
          <textarea
            id="description"
            rows={5}
            maxLength={2000}
            value={values.description}
            aria-invalid={errors.description ? true : undefined}
            onChange={(e) => {
              update("description", e.target.value);
            }}
          />
          {errors.description && (
            <p className="field-error">{errors.description}</p>
          )}
        </div>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="button" disabled={ask.isPending}>
          {ask.isPending ? "Publishing…" : "Publish question"}
        </button>
      </form>
    </section>
  );
}
