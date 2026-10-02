import type {
  LoginInput,
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

// Only follow same-site paths after login, so ?next= can't send people to
// another website.
export function safeRedirect(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
}
