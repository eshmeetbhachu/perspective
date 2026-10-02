import type {
  CreatePostInput,
  MyStanceResponse,
  PostListResponse,
  PostResponse,
  Stance,
  UpdatePostInput,
} from "@perspective/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";

export function useMyStance(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["stance", slug],
    queryFn: () => api<MyStanceResponse>(`/questions/${slug}/stance`),
    enabled,
  });
}

export function useSetStance(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stance: Stance) =>
      api<MyStanceResponse>(`/questions/${slug}/stance`, {
        method: "PUT",
        body: { stance },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["stance", slug], data);
    },
  });
}

export function useColumn(slug: string, stance: Stance) {
  return useInfiniteQuery({
    queryKey: ["posts", slug, stance],
    queryFn: ({ pageParam }) =>
      api<PostListResponse>(
        `/questions/${slug}/posts?stance=${stance}${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: ["post", id],
    queryFn: () => api<PostResponse>(`/posts/${id}`),
    retry: false,
  });
}

export function useWritePost(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) =>
      api<PostResponse>(`/questions/${slug}/posts`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts", slug] });
    },
  });
}

export function useEditPost(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePostInput) =>
      api<PostResponse>(`/posts/${id}`, { method: "PATCH", body: input }),
    onSuccess: (data) => {
      queryClient.setQueryData(["post", id], data);
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<undefined>(`/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}
