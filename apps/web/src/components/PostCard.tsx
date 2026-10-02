import { CROSS_SIDE_BADGE_MIN, type Post } from "@perspective/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../auth";
import { renderMarkdown } from "../markdown";
import { useDeletePost } from "../posts";
import { HelpfulButton } from "./HelpfulButton";
import { formatDate } from "./QuestionCard";

const LONG_POST = 600;

export function PostCard({ post, slug }: { post: Post; slug: string }) {
  const { data: user } = useCurrentUser();
  const deletePost = useDeletePost();
  const [expanded, setExpanded] = useState(false);
  const html = useMemo(() => renderMarkdown(post.body), [post.body]);
  const isOwn = Boolean(user && post.author?.username === user.username);
  const isLong = post.body.length > LONG_POST;

  return (
    <li className="post-card">
      {post.crossSideCount >= CROSS_SIDE_BADGE_MIN && (
        <p
          className="badge badge-across"
          title={`Helpful to ${String(post.crossSideCount)} people from other sides`}
        >
          Valued across sides
        </p>
      )}
      <h3 className="post-title">{post.title}</h3>
      <div
        className={`markdown ${isLong && !expanded ? "clamped" : ""}`}
        // Sanitized by renderMarkdown (DOMPurify).
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isLong && (
        <button
          type="button"
          className="link-button small"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <HelpfulButton post={post} slug={slug} />
      <p className="question-meta">
        {post.author ? post.author.username : "deleted account"} ·{" "}
        {formatDate(post.createdAt)}
        {post.editedAt && " · edited"}
      </p>
      {isOwn && (
        <div className="post-actions">
          <Link to={`/posts/${post.id}/edit`}>Edit</Link>
          <button
            type="button"
            className="link-button danger"
            disabled={deletePost.isPending}
            onClick={() => {
              if (window.confirm("Delete this post? This can't be undone.")) {
                deletePost.mutate(post.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
