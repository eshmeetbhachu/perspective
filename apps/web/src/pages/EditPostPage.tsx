import { Link, useNavigate, useParams } from "react-router";
import { useCurrentUser } from "../auth";
import { PostEditor } from "../components/PostEditor";
import { useEditPost, usePost } from "../posts";

export function EditPostPage() {
  const { id = "" } = useParams();
  const { data: user } = useCurrentUser();
  const post = usePost(id);
  const edit = useEditPost(id);
  const navigate = useNavigate();

  if (post.isPending) return <p className="muted">Loading…</p>;
  if (!post.data) {
    return (
      <section className="card">
        <h1>Post not found</h1>
        <Link to="/">Browse questions</Link>
      </section>
    );
  }

  const { post: current } = post.data;
  if (current.author?.username !== user?.username) {
    return (
      <section className="card">
        <h1>You can only edit your own posts</h1>
        <Link to="/">Browse questions</Link>
      </section>
    );
  }

  return (
    <section className="card card-wide">
      <h1>Edit your post</h1>
      <PostEditor
        initial={{ title: current.title, body: current.body }}
        submitLabel="Save changes"
        pending={edit.isPending}
        onSubmit={(input, onError) => {
          edit.mutate(input, {
            onSuccess: () => {
              void navigate(-1);
            },
            onError,
          });
        }}
      />
    </section>
  );
}
