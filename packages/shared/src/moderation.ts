import { z } from "zod";

export const REPORT_TARGETS = [
  "question",
  "post",
  "challenge",
  "comment",
] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

// Reasons a person can choose; "automated" is reserved for the spam checks.
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "misleading",
  "off_topic",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number] | "automated";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or advertising",
  harassment: "Harassment or personal attack",
  hate: "Hate speech",
  misleading: "Deliberately misleading",
  off_topic: "Off topic or loaded question",
  other: "Something else",
  automated: "Flagged automatically",
};

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
});
export type CreateReportInput = z.input<typeof createReportSchema>;

export const moderationReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Say briefly why")
    .max(500, "Use at most 500 characters"),
});
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;

// One row per reported item, with every open report on it rolled up.
export const queueItemSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reportCount: z.number().int(),
  reasons: z.array(z.enum([...REPORT_REASONS, "automated"] as const)),
  details: z.array(z.string()),
  lastReportedAt: z.string(),
  // What the moderator is judging, or null if it no longer exists.
  preview: z
    .object({
      title: z.string(),
      excerpt: z.string(),
      author: z.object({ username: z.string() }).nullable(),
      authorBanned: z.boolean(),
      link: z.string(),
      removed: z.boolean(),
    })
    .nullable(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const queueResponseSchema = z.object({
  items: z.array(queueItemSchema),
});
export type QueueResponse = z.infer<typeof queueResponseSchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  actor: z.object({ username: z.string() }).nullable(),
  action: z.enum([
    "remove",
    "restore",
    "dismiss_reports",
    "ban_user",
    "unban_user",
  ]),
  targetType: z.string(),
  targetId: z.uuid(),
  reason: z.string(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
});
export type AuditResponse = z.infer<typeof auditResponseSchema>;
