import { Link, useNavigate, useParams } from "react-router";
import { useCurrentUser } from "../auth";
import { PostEditor } from "../components/PostEditor";
import { useMyStance, useWritePost } from "../posts";
import { useQuestion } from "../questions";

export function WritePostPage() {
  const { slug = "" } = useParams();
  const { data: user } = useCurrentUser();
  const question = useQuestion(slug);
  const myStance = useMyStance(slug, Boolean(user));
  const write = useWritePost(slug);
  const navigate = useNavigate();

  if (!user || question.isPending || myStance.isPending) {
    return <p className="muted">Loading…</p>;
  }
  if (!question.data) {
    return <p className="form-error">Question not found.</p>;
  }

  const stance = myStance.data?.stance;
  if (!user.emailVerified || !stance) {
    return (
      <section className="card">
        <h1>{stance ? "Verify your email first" : "Choose a side first"}</h1>
        <p className="muted">
          {stance
            ? "Only verified accounts can post. Use the link we emailed you."
            : "Your post goes in the column of your stance, so pick one on the question page."}
        </p>
        <Link to={`/q/${slug}`}>Back to the question</Link>
      </section>
    );
  }

  return (
    <section className="card card-wide">
      <p className="muted small">
        <Link to={`/q/${slug}`}>{question.data.question.title}</Link>
      </p>
      <h1>
        Write a post for{" "}
        <span className={`stance-text-${stance}`}>{stance}</span>
      </h1>
      <p className="muted">
        Explain the reasoning behind your stance, so people on other sides can
        understand it.
      </p>
      <PostEditor
        submitLabel="Publish post"
        pending={write.isPending}
        onSubmit={(input, onError) => {
          write.mutate(input, {
            onSuccess: () => {
              void navigate(`/q/${slug}`);
            },
            onError,
          });
        }}
      />
    </section>
  );
}
