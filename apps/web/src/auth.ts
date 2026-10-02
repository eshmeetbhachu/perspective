import type {
  CompleteGoogleSignupInput,
  GooglePendingResponse,
  LoginInput,
  ProvidersResponse,
  PublicUser,
  RegisterInput,
  UserResponse,
} from "@perspective/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";

const ME = ["me"];

// The logged-in user, or null when nobody is logged in.
export function useCurrentUser() {
  return useQuery({
    queryKey: ME,
    queryFn: async (): Promise<PublicUser | null> => {
      try {
        return (await api<UserResponse>("/auth/me")).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<UserResponse>("/auth/login", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<UserResponse>("/auth/register", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<undefined>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData(ME, null);
    },
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => api<ProvidersResponse>("/auth/providers"),
    staleTime: Infinity,
  });
}

// The Google sign-in waiting to be finished, or null if there is none.
export function useGooglePending(enabled = true) {
  return useQuery({
    queryKey: ["google-pending"],
    enabled,
    queryFn: async (): Promise<GooglePendingResponse | null> => {
      try {
        return await api<GooglePendingResponse>("/auth/google/pending");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useCompleteGoogleSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompleteGoogleSignupInput) =>
      api<UserResponse>("/auth/google/complete", {
        method: "POST",
        body: input,
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME, user);
      queryClient.removeQueries({ queryKey: ["google-pending"] });
    },
  });
}

// Only follow same-site paths after login, so ?next= can't send people to
// another website.
export function safeRedirect(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
}
