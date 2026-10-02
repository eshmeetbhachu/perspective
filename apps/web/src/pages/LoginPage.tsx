import { loginSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  safeRedirect,
  useCurrentUser,
  useGooglePending,
  useLogin,
} from "../auth";
import { Field } from "../components/Field";
import { GoogleButton } from "../components/GoogleButton";
import { errorsFromApi, type FieldErrors, validate } from "../forms";

const GOOGLE_ERRORS: Partial<Record<string, string>> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in didn't work. Please try again.",
  google_unverified: "Your Google email address isn't verified yet.",
  account_suspended: "This account has been suspended.",
};

export function LoginPage() {
  const { data: user } = useCurrentUser();
  const login = useLogin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeRedirect(searchParams.get("next"));
  const linking = searchParams.get("link") === "google";
  const pending = useGooglePending(linking);
  const googleError = GOOGLE_ERRORS[searchParams.get("error") ?? ""];
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (user) return <Navigate to={next} replace />;

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(loginSchema, values);
    if (!data) {
      setErrors(invalid);
      return;
    }

    login.mutate(data, {
      onSuccess: () => {
        void navigate(next, { replace: true });
      },
      onError: (err) => {
        const { fields, form } = errorsFromApi(err);
        setErrors(fields);
        setFormError(form);
      },
    });
  }

  return (
    <section className="card">
      <h1>Log in</h1>
      {linking && pending.data && (
        <p className="notice">
          An account with <strong>{pending.data.email}</strong> already exists.
          Log in to it to connect your Google account.
        </p>
      )}
      {googleError && <p className="form-error">{googleError}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => {
            update("email", e.target.value);
          }}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => {
            update("password", e.target.value);
          }}
          error={errors.password}
        />
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="button" disabled={login.isPending}>
          {login.isPending ? "Logging in…" : "Log in"}
        </button>
      </form>
      {!linking && <GoogleButton />}
      <p className="muted">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </section>
  );
}
