import { forgotPasswordSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link } from "react-router";
import { useForgotPassword } from "../auth";
import { Field } from "../components/Field";
import { errorsFromApi, type FieldErrors, validate } from "../forms";

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (forgot.isSuccess) {
    return (
      <section className="card">
        <h1>Check your email</h1>
        <p className="muted">
          If an account exists for that address, we've sent a link to reset the
          password. It works for 30 minutes.
        </p>
        <Link to="/login">Back to log in</Link>
      </section>
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(forgotPasswordSchema, { email });
    if (!data) {
      setErrors(invalid);
      return;
    }

    forgot.mutate(data, {
      onError: (err) => {
        const { fields, form } = errorsFromApi(err);
        setErrors(fields);
        setFormError(form);
      },
    });
  }

  return (
    <section className="card">
      <h1>Forgot your password?</h1>
      <p className="muted">We'll email you a link to choose a new one.</p>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors({});
          }}
          error={errors.email}
        />
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="button" disabled={forgot.isPending}>
          {forgot.isPending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="muted">
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
