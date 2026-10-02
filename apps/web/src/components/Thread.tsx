import { type Comment, createCommentSchema } from "@perspective/shared";
import { type SubmitEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { useCurrentUser } from "../auth";
import { useDeleteComment, useReply } from "../challenges";
import { errorsFromApi, validate } from "../forms";
import { renderMarkdown } from "../markdown";
import { formatDate } from "./QuestionCard";

interface Node {
  comment: Comment;
  replies: Node[];
}

// The API returns comments depth-first; this rebuilds the nesting. A comment
// whose parent isn't in the list (e.g. a "continue thread" root) is a root.
function buildTree(comments: Comment[]): Node[] {
  const nodes = new Map<string, Node>();
  const roots: Node[] = [];
  for (const comment of comments) {
    const node = { comment, replies: [] };
    nodes.set(comment.id, node);
    const parent = comment.parentId ? nodes.get(comment.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export function ReplyForm({
  challengeId,
  parentId,
  onDone,
  autoFocus = false,
}: {
  challengeId: string;
  parentId?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const reply = useReply(challengeId);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data, errors } = validate(createCommentSchema, { body, parentId });
    if (!data) {
      setError(errors.body ?? "Something is wrong with this reply");
      return;
    }
    reply.mutate(data, {
      onSuccess: () => {
        setBody("");
        setError(null);
        onDone?.();
      },
      onError: (err) => {
        const { fields, form } = errorsFromApi(err);
        setError(form ?? fields.body ?? "Couldn't post your reply");
      },
    });
  }

  return (
    <form className="reply-form" onSubmit={handleSubmit} noValidate>
      <textarea
        aria-label={parentId ? "Your reply" : "Add to the discussion"}
        placeholder={parentId ? "Write a reply…" : "Add to the discussion…"}
        rows={3}
        maxLength={5000}
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
      />
      {error && <p className="form-error">{error}</p>}
      <div className="reply-actions">
        <button
          type="submit"
          className="button button-small"
          disabled={reply.isPending}
        >
          {reply.isPending ? "Posting…" : parentId ? "Reply" : "Comment"}
        </button>
        {onDone && (
          <button type="button" className="link-button small" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CommentNode({
  node,
  challengeId,
  canReply,
}: {
  node: Node;
  challengeId: string;
  canReply: boolean;
}) {
  const { comment, replies } = node;
  const { data: user } = useCurrentUser();
  const remove = useDeleteComment(challengeId);
  const [replying, setReplying] = useState(false);
  const html = useMemo(() => renderMarkdown(comment.body), [comment.body]);
  const isOwn = Boolean(
    user && !comment.deleted && comment.author?.username === user.username,
  );

  return (
    <li className="comment" id={`comment-${comment.id}`}>
      {comment.deleted ? (
        <p className="comment-deleted">[deleted]</p>
      ) : (
        <>
          <p className="question-meta comment-meta">
            <strong>{comment.author?.username ?? "deleted account"}</strong> ·{" "}
            {formatDate(comment.createdAt)}
          </p>
          <div
            className="markdown"
            // Sanitized by renderMarkdown (DOMPurify).
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="post-actions">
            {canReply && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setReplying((value) => !value);
                }}
              >
                Reply
              </button>
            )}
            {isOwn && (
              <button
                type="button"
                className="link-button danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Delete this comment?")) {
                    remove.mutate(comment.id);
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
          {replying && (
            <ReplyForm
              challengeId={challengeId}
              parentId={comment.id}
              autoFocus
              onDone={() => {
                setReplying(false);
              }}
            />
          )}
        </>
      )}

      {replies.length > 0 && (
        <ul className="comment-list">
          {replies.map((child) => (
            <CommentNode
              key={child.comment.id}
              node={child}
              challengeId={challengeId}
              canReply={canReply}
            />
          ))}
        </ul>
      )}
      {comment.hasMoreReplies && (
        <Link
          to={`/c/${challengeId}?root=${comment.id}`}
          className="continue-thread"
        >
          Continue this thread →
        </Link>
      )}
    </li>
  );
}

export function Thread({
  comments,
  challengeId,
  canReply,
}: {
  comments: Comment[];
  challengeId: string;
  canReply: boolean;
}) {
  const tree = useMemo(() => buildTree(comments), [comments]);
  const { hash } = useLocation();

  // Comments load after the page, so jump to #comment-… once they're here.
  useEffect(() => {
    if (hash) document.querySelector(hash)?.scrollIntoView({ block: "center" });
  }, [hash, comments]);

  return (
    <ul className="comment-list comment-list-root">
      {tree.map((node) => (
        <CommentNode
          key={node.comment.id}
          node={node}
          challengeId={challengeId}
          canReply={canReply}
        />
      ))}
    </ul>
  );
}
