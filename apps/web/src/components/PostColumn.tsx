import type { PostSort, Stance } from "@perspective/shared";
import { Link } from "react-router";
import { useColumn } from "../posts";
import { PostCard } from "./PostCard";

export function PostColumn({
  slug,
  stance,
  sort,
  canWrite,
}: {
  slug: string;
  stance: Stance;
  sort: PostSort;
  canWrite: boolean;
}) {
  const column = useColumn(slug, stance, sort);
  const posts = column.data?.pages.flatMap((page) => page.posts) ?? [];

  return (
    <section className={`column column-${stance}`} aria-label={stance}>
      <div className="column-header">
        <h2 className={`stance stance-${stance}`}>{stance}</h2>
        {canWrite && (
          <Link to={`/q/${slug}/write`} className="button button-small">
            Write a post
          </Link>
        )}
      </div>

      {column.isPending && <p className="muted">Loading…</p>}
      {column.isError && <p className="form-error">Couldn't load posts.</p>}
      {column.isSuccess && posts.length === 0 && (
        <p className="muted">No perspectives yet.</p>
      )}

      <ul className="post-list">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </ul>

      {column.hasNextPage && (
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={column.isFetchingNextPage}
          onClick={() => {
            void column.fetchNextPage();
          }}
        >
          {column.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}
