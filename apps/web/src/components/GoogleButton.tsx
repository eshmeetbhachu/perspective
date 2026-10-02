import { useProviders } from "../auth";

// A real page navigation, not fetch: the browser has to visit Google itself.
export function GoogleButton({
  intent = "login",
}: {
  intent?: "login" | "link";
}) {
  const { data } = useProviders();
  if (!data?.google) return null;

  if (intent === "link") {
    return (
      <a
        href="/api/auth/google/start?intent=link"
        className="button button-google"
      >
        Connect Google
      </a>
    );
  }

  return (
    <>
      <p className="divider">or</p>
      <a
        href="/api/auth/google/start?intent=login"
        className="button button-google"
      >
        Continue with Google
      </a>
    </>
  );
}
