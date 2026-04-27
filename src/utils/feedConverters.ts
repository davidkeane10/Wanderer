import type { ActivityType, FeedItem } from "../types/feed";
import type { RedditPost } from "../types/reddit";
import { getPostImage } from "./formatters";
import { extractDescription, extractPrimaryLocation } from "./locationParser";

export function redditPostToFeedItem(post: RedditPost, activityType?: ActivityType): FeedItem {
  return {
    id: `reddit_${post.id}`,
    source: "reddit",
    activityType: activityType ?? null,
    title: post.title,
    description: extractDescription(post.selftext),
    imageUrl: getPostImage(post),
    externalUrl: `https://www.reddit.com${post.permalink}`,
    locationName: extractPrimaryLocation(post.title, post.selftext),
    locationCoords: null, // geocoded lazily in QuestCard
    score: post.score,
    commentCount: post.num_comments,
    createdAt: post.created_utc,
    sourceName: `r/${post.subreddit}`,
    rating: null,
    redditPermalink: post.permalink,
    redditSelftext: post.selftext,
    redditAuthor: post.author,
    redditIsLink: !post.is_self,
    redditUrl: post.url,
  };
}
