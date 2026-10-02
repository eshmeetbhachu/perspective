import { registerSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useCurrentUser, useRegister } from "../auth";
import { Field } from "../components/Field";
import { GoogleButton } from "../components/GoogleButton";
import { errorsFromApi, type FieldErrors, validate } from "../forms";

export function SignupPage() {
  const { data: user } = useCurrentUser();
  const register = useRegister();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (user) return <Navigate to="/account" replace />;

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(registerSchema, values);
    if (!data) {
      setErrors(invalid);
      return;
    }

    register.mutate(data, {
      onSuccess: () => {
        void navigate("/account");
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
      <h1>Create your account</h1>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Username"
          autoComplete="username"
          value={values.username}
          onChange={(e) => {
            update("username", e.target.value);
          }}
          error={errors.username}
          hint="3–20 letters, numbers or underscores"
        />
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
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => {
            update("password", e.target.value);
          }}
          error={errors.password}
          hint="At least 12 characters. A short sentence works well."
        />
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="button" disabled={register.isPending}>
          {register.isPending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <GoogleButton />
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
