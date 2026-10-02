import { resetPasswordSchema } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useResetPassword } from "../auth";
import { Field } from "../components/Field";
import { errorsFromApi, type FieldErrors, validate } from "../forms";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const reset = useResetPassword();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { data, errors: invalid } = validate(resetPasswordSchema, {
      token,
      password,
    });
    if (!data) {
      setErrors(invalid);
      if (invalid.token) setFormError("This reset link is incomplete.");
      return;
    }

    reset.mutate(data, {
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
      <h1>Choose a new password</h1>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors({});
          }}
          error={errors.password}
          hint="At least 12 characters. A short sentence works well."
        />
        {formError && (
          <p className="form-error">
            {formError}{" "}
            {reset.isError && (
              <Link to="/forgot-password">Send a new link</Link>
            )}
          </p>
        )}
        <button type="submit" className="button" disabled={reset.isPending}>
          {reset.isPending ? "Saving…" : "Save password and log in"}
        </button>
      </form>
    </section>
  );
}
