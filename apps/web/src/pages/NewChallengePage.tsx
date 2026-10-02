import { createChallengeSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useCurrentUser } from "../auth";
import { useCreateChallenge } from "../challenges";
import { Field } from "../components/Field";
import { errorsFromApi, type FieldErrors, validate } from "../forms";
import { usePost } from "../posts";

export function NewChallengePage() {
  const { id = "" } = useParams();
  const { data: user } = useCurrentUser();
  const post = usePost(id);
  const create = useCreateChallenge(id);
  const navigate = useNavigate();
  const [values, setValues] = useState({ title: "", body: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (post.isPending || !user) return <p className="muted">Loading…</p>;
  if (!post.data) return <p className="form-error">Post not found.</p>;

  if (!user.emailVerified) {
    return (
      <section className="card">
        <h1>Verify your email first</h1>
        <p className="muted">Only verified accounts can start challenges.</p>
        <Link to={`/posts/${id}`}>Back to the post</Link>
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
    const { data, errors: invalid } = validate(createChallengeSchema, values);
    if (!data) {
      setErrors(invalid);
      return;
    }
    create.mutate(data, {
      onSuccess: ({ challenge }) => {
        void navigate(`/c/${challenge.id}`);
      },
      onError: (err) => {
        const { fields, form } = errorsFromApi(err);
        setErrors(fields);
        setFormError(form);
      },
    });
  }

  return (
    <section className="card card-wide">
      <p className="muted small">
        Challenging <Link to={`/posts/${id}`}>“{post.data.post.title}”</Link>
      </p>
      <h1>Challenge this post</h1>
      <p className="muted">
        Point at a specific claim and explain what it misses. The author is
        notified and the discussion continues on the challenge page.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="What are you challenging?"
          value={values.title}
          maxLength={120}
          onChange={(e) => {
            update("title", e.target.value);
          }}
          error={errors.title}
        />
        <div className="field">
          <label htmlFor="challenge-body">Your argument</label>
          <textarea
            id="challenge-body"
            rows={8}
            maxLength={5000}
            value={values.body}
            aria-invalid={errors.body ? true : undefined}
            onChange={(e) => {
              update("body", e.target.value);
            }}
          />
          {errors.body ? (
            <p className="field-error">{errors.body}</p>
          ) : (
            <p className="field-hint">Markdown works here too.</p>
          )}
        </div>
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="button" disabled={create.isPending}>
          {create.isPending ? "Starting…" : "Start challenge"}
        </button>
      </form>
    </section>
  );
}
