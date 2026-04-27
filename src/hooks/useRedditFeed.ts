import { useCallback, useRef, useState } from "react";
import { fetchPosts } from "../services/reddit";
import type { RedditPost } from "../types/reddit";

interface FeedState {
  posts: RedditPost[];
  after: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasMore: boolean;
}

interface UseRedditFeedOptions {
  subreddits: string[];
  sort: "hot" | "top" | "new";
  timeframe?: string;
  limit?: number;
}

export function useRedditFeed({ subreddits, sort, timeframe, limit = 25 }: UseRedditFeedOptions) {
  const [state, setState] = useState<FeedState>({
    posts: [],
    after: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    hasMore: true,
  });

  const isFetchingRef = useRef(false);

  const load = useCallback(
    async (refresh = false) => {
      if (isFetchingRef.current) return;
      if (!refresh && !state.hasMore && state.posts.length > 0) return;

      isFetchingRef.current = true;
      setState((prev) => ({
        ...prev,
        isLoading: !refresh,
        isRefreshing: refresh,
        error: null,
      }));

      try {
        const result = await fetchPosts(subreddits, sort, {
          limit,
          after: refresh ? null : state.after,
          timeframe,
        });

        setState((prev) => ({
          posts: refresh ? result.posts : [...prev.posts, ...result.posts],
          after: result.after,
          isLoading: false,
          isRefreshing: false,
          error: null,
          hasMore: result.after !== null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: err instanceof Error ? err.message : "Failed to load posts",
        }));
      } finally {
        isFetchingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subreddits.join("+"), sort, timeframe, limit, state.after, state.hasMore, state.posts.length]
  );

  const loadMore = useCallback(() => {
    if (!state.isLoading && !state.isRefreshing && state.hasMore) {
      load(false);
    }
  }, [load, state.isLoading, state.isRefreshing, state.hasMore]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return {
    ...state,
    load,
    loadMore,
    refresh,
  };
}
