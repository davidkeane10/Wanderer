export function formatScore(score: number): string {
  if (score >= 1000) {
    return `${(score / 1000).toFixed(1)}k`;
  }
  return score.toString();
}

export function timeAgo(utcTimestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - utcTimestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

export function getPostImage(post: {
  thumbnail: string;
  preview?: {
    images: Array<{
      source: { url: string };
      resolutions: Array<{ url: string; width: number }>;
    }>;
  };
}): string | null {
  // Try preview image first (better quality)
  if (post.preview?.images?.[0]) {
    const resolutions = post.preview.images[0].resolutions;
    // Pick a medium-res image (around 320px wide)
    const medium = resolutions.find((r) => r.width >= 320) ?? post.preview!.images[0].source;
    // Reddit HTML-encodes the URL - decode it
    return medium.url.replace(/&amp;/g, "&");
  }

  // Fall back to thumbnail if it's a real URL
  if (
    post.thumbnail &&
    post.thumbnail.startsWith("http")
  ) {
    return post.thumbnail;
  }

  return null;
}
