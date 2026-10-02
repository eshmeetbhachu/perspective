import { completeGoogleSignupSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  useCompleteGoogleSignup,
  useCurrentUser,
  useGooglePending,
} from "../auth";
import { Field } from "../components/Field";
import { errorsFromApi, type FieldErrors, validate } from "../forms";

export function GoogleSignupPage() {
  const { data: user } = useCurrentUser();
  const pending = useGooglePending();
  const complete = useCompleteGoogleSignup();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (user) return <Navigate to="/account" replace />;
  if (pending.isPending) return <p className="muted">Loading…</p>;

  if (pending.data?.accountExists) {
    return <Navigate to="/login?link=google" replace />;
  }

  if (!pending.data) {
    return (
      <section className="card">
        <h1>Sign-in expired</h1>
        <p className="muted">
          Your Google sign-in timed out. <Link to="/login">Try again</Link>.
        </p>
      </section>
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(completeGoogleSignupSchema, {
      username,
    });
    if (!data) {
      setErrors(invalid);
      return;
    }

    complete.mutate(data, {
      onSuccess: () => {
        void navigate("/account");
      },
      onError: (err) => {
        const { fields, form } = errorsFromApi(err);
        setErrors(fields);
        setFormError(form ?? fields.email ?? null);
      },
    });
  }

  return (
    <section className="card">
      <h1>Choose a username</h1>
      <p className="muted">
        You're signing up with <strong>{pending.data.email}</strong>.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setErrors({});
          }}
          error={errors.username}
          hint="3–20 letters, numbers or underscores"
        />
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="button" disabled={complete.isPending}>
          {complete.isPending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </section>
  );
}
