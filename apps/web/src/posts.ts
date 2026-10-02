import type {
  CreatePostInput,
  MyStanceResponse,
  PostListResponse,
  PostResponse,
  PostSort,
  Stance,
  UpdatePostInput,
  VoteResponse,
} from "@perspective/shared";
import {
  type InfiniteData,
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

export function useColumn(slug: string, stance: Stance, sort: PostSort) {
  return useInfiniteQuery({
    queryKey: ["posts", slug, stance, sort],
    queryFn: ({ pageParam }) =>
      api<PostListResponse>(
        `/questions/${slug}/posts?stance=${stance}&sort=${sort}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
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

// Updates the counts in place instead of refetching, so a column doesn't
// reshuffle under the reader's cursor right after they vote.
export function useVote(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, voted }: { postId: string; voted: boolean }) =>
      api<VoteResponse>(`/posts/${postId}/vote`, {
        method: voted ? "PUT" : "DELETE",
      }),
    onSuccess: (counts, { postId }) => {
      queryClient.setQueryData<PostResponse>(
        ["post", postId],
        (data) => data && { post: { ...data.post, ...counts } },
      );
      queryClient.setQueriesData<InfiniteData<PostListResponse>>(
        { queryKey: ["posts", slug] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post.id === postId ? { ...post, ...counts } : post,
              ),
            })),
          },
      );
    },
  });
}
