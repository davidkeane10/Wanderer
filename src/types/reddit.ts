export interface RedditPost {
  id: string;
  name: string; // fullname e.g. t3_abc123
  title: string;
  selftext: string;
  score: number;
  url: string;
  permalink: string;
  thumbnail: string;
  subreddit: string;
  created_utc: number;
  num_comments: number;
  is_self: boolean;
  over_18: boolean;
  preview?: {
    images: Array<{
      source: { url: string; width: number; height: number };
      resolutions: Array<{ url: string; width: number; height: number }>;
    }>;
  };
  author: string;
}

export interface RedditChild {
  kind: string;
  data: RedditPost;
}

export interface RedditListing {
  kind: string;
  data: {
    after: string | null;
    before: string | null;
    children: RedditChild[];
    dist: number;
  };
}
