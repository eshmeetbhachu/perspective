import type {
  AuditResponse,
  CreateReportInput,
  QueueResponse,
  ReportTarget,
} from "@perspective/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export function useReport() {
  return useMutation({
    mutationFn: (input: CreateReportInput) =>
      api<undefined>("/reports", { method: "POST", body: input }),
  });
}

export function useQueue() {
  return useQuery({
    queryKey: ["moderation", "queue"],
    queryFn: () => api<QueueResponse>("/moderation/queue"),
  });
}

export function useAudit() {
  return useQuery({
    queryKey: ["moderation", "audit"],
    queryFn: () => api<AuditResponse>("/moderation/audit"),
  });
}

type ContentAction = "remove" | "restore" | "dismiss";

export function useModerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      targetType,
      targetId,
      reason,
    }: {
      action: ContentAction;
      targetType: ReportTarget;
      targetId: string;
      reason: string;
    }) =>
      api<undefined>(`/moderation/${targetType}/${targetId}/${action}`, {
        method: "POST",
        body: action === "dismiss" ? undefined : { reason },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["moderation"] });
    },
  });
}

export function useBan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      username,
      reason,
      unban,
    }: {
      username: string;
      reason: string;
      unban?: boolean;
    }) =>
      api<undefined>(
        `/moderation/users/${encodeURIComponent(username)}/${unban ? "unban" : "ban"}`,
        { method: "POST", body: { reason } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["moderation"] });
    },
  });
}
