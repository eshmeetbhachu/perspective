import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

const WAKE_URL = "https://api.example/health";

function respond(status: number, body: unknown = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}

// The wake-up request answers like a no-cors fetch; API calls get `statuses`
// in order, then keep the last one.
function fakeFetch(...statuses: number[]) {
  let calls = 0;
  return vi.fn((url: string) => {
    if (url === WAKE_URL) return Promise.resolve(new Response(null));
    const status = statuses[Math.min(calls++, statuses.length - 1)] ?? 200;
    // The host's 502 is an HTML error page, not our JSON error shape.
    if (status === 502) {
      return Promise.resolve(new Response("<html>502</html>", { status }));
    }
    return Promise.resolve(respond(status, { ok: true }));
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api while the API host is asleep", () => {
  it("wakes the API directly and retries until it answers", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_WAKE_URL", WAKE_URL);
    const fetchMock = fakeFetch(502, 502, 200);
    vi.stubGlobal("fetch", fetchMock);

    const result = api<{ ok: boolean }>("/questions");
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toEqual({ ok: true });
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url === "/api/questions")).toHaveLength(3);
    expect(urls).toContain(WAKE_URL);
  });

  it("gives up after two minutes", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_WAKE_URL", WAKE_URL);
    vi.stubGlobal("fetch", fakeFetch(502));

    const result = api("/questions");
    const settled = expect(result).rejects.toMatchObject({ status: 502 });
    await vi.advanceTimersByTimeAsync(125_000);
    await settled;
  });

  it("doesn't retry other errors", async () => {
    vi.stubEnv("VITE_API_WAKE_URL", WAKE_URL);
    const fetchMock = vi.fn().mockResolvedValue(
      respond(500, {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/questions")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
