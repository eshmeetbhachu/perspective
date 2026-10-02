import type {
  ChallengeListResponse,
  ChallengeResponse,
  CreateChallengeInput,
  CreateCommentInput,
  NotificationListResponse,
  ThreadResponse,
  UnreadCountResponse,
} from "@perspective/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export function usePostChallenges(postId: string) {
  return useQuery({
    queryKey: ["challenges", postId],
    queryFn: () => api<ChallengeListResponse>(`/posts/${postId}/challenges`),
  });
}

export function useChallenge(id: string) {
  return useQuery({
    queryKey: ["challenge", id],
    queryFn: () => api<ChallengeResponse>(`/challenges/${id}`),
    retry: false,
  });
}

export function useThread(challengeId: string, root: string | null) {
  return useQuery({
    queryKey: ["thread", challengeId, root],
    queryFn: () =>
      api<ThreadResponse>(
        `/challenges/${challengeId}/comments${root ? `?root=${root}` : ""}`,
      ),
  });
}

export function useCreateChallenge(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChallengeInput) =>
      api<ChallengeResponse>(`/posts/${postId}/challenges`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["challenges", postId] });
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useReply(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api<unknown>(`/challenges/${challengeId}/comments`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread", challengeId] });
      void queryClient.invalidateQueries({
        queryKey: ["challenge", challengeId],
      });
    },
  });
}

export function useDeleteComment(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api<undefined>(`/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread", challengeId] });
      void queryClient.invalidateQueries({
        queryKey: ["challenge", challengeId],
      });
    },
  });
}

// Checked once a minute while a page is open (D49).
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<UnreadCountResponse>("/notifications/unread-count"),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api<NotificationListResponse>("/notifications"),
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<undefined>("/notifications/read", { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData<UnreadCountResponse>(
        ["notifications", "unread"],
        { unreadCount: 0 },
      );
    },
  });
}
