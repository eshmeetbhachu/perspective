import { CROSS_SIDE_BADGE_MIN, type Post } from "@perspective/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../auth";
import { renderMarkdown } from "../markdown";
import { useDeletePost } from "../posts";
import { HelpfulButton } from "./HelpfulButton";
import { ReportButton } from "./ReportButton";
import { formatDate } from "./QuestionCard";

const LONG_POST = 600;

export function PostCard({ post }: { post: Post }) {
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
      <HelpfulButton post={post} />
      <p className="question-meta">
        {post.author ? post.author.username : "deleted account"} ·{" "}
        {formatDate(post.createdAt)}
        {post.editedAt && " · edited"}
      </p>
      <div className="post-actions">
        <Link to={`/posts/${post.id}`}>
          {post.challengeCount === 0
            ? "Challenges"
            : `${String(post.challengeCount)} ${post.challengeCount === 1 ? "challenge" : "challenges"}`}
        </Link>
        {user && !isOwn && (
          <Link to={`/posts/${post.id}/challenge`}>Challenge</Link>
        )}
        {!isOwn && <ReportButton targetType="post" targetId={post.id} />}
      </div>
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
