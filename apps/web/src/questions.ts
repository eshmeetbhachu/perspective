import type {
  CreateQuestionInput,
  QuestionListResponse,
  QuestionResponse,
} from "@perspective/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";

export function useLatestQuestions() {
  return useInfiniteQuery({
    queryKey: ["questions", "latest"],
    queryFn: ({ pageParam }) =>
      api<QuestionListResponse>(
        pageParam ? `/questions?cursor=${pageParam}` : "/questions",
      ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useQuestionSearch(query: string) {
  return useQuery({
    queryKey: ["questions", "search", query],
    queryFn: () =>
      api<QuestionListResponse>(
        `/questions/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.length >= 2,
  });
}

// Waits until the user pauses typing, so every keystroke isn't a request.
function useDebounced(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

export function useSimilarQuestions(title: string) {
  const debounced = useDebounced(title.trim(), 400);
  return useQuery({
    queryKey: ["questions", "similar", debounced],
    queryFn: () =>
      api<QuestionListResponse>(
        `/questions/similar?title=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.length >= 5,
    placeholderData: (previous) => previous,
  });
}

export function useQuestion(slug: string) {
  return useQuery({
    queryKey: ["question", slug],
    queryFn: () =>
      api<QuestionResponse>(`/questions/${encodeURIComponent(slug)}`),
    retry: false,
  });
}

export function useAskQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuestionInput) =>
      api<QuestionResponse>("/questions", { method: "POST", body: input }),
    onSuccess: ({ question }) => {
      queryClient.setQueryData(["question", question.slug], { question });
      void queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}
