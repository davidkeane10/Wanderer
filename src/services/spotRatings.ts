import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export interface SpotRatingSummary {
  avgRating: number;
  reviewCount: number;
  userStars: number | null;
}

export async function getSpotRatingSummary(spotId: string): Promise<SpotRatingSummary | null> {
  const ratingSnap = await getDoc(doc(db, "spot_ratings", spotId));
  if (!ratingSnap.exists()) return null;

  const data = ratingSnap.data();
  const userId = auth.currentUser?.uid ?? null;

  let userStars: number | null = null;
  if (userId) {
    const reviewSnap = await getDoc(doc(db, "spot_ratings", spotId, "reviews", userId));
    if (reviewSnap.exists()) userStars = reviewSnap.data().stars;
  }

  return {
    avgRating: data.avgRating ?? 0,
    reviewCount: data.reviewCount ?? 0,
    userStars,
  };
}

export async function submitSpotRating(
  spotId: string,
  spotTitle: string,
  stars: number,
  comment: string
): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("Not authenticated");

  const ratingRef = doc(db, "spot_ratings", spotId);
  const reviewRef = doc(db, "spot_ratings", spotId, "reviews", userId);

  await runTransaction(db, async (tx) => {
    const ratingSnap = await tx.get(ratingRef);
    const reviewSnap = await tx.get(reviewRef);

    const prevStars: number | null = reviewSnap.exists() ? reviewSnap.data().stars : null;
    let totalStars: number = ratingSnap.exists() ? (ratingSnap.data().totalStars ?? 0) : 0;
    let reviewCount: number = ratingSnap.exists() ? (ratingSnap.data().reviewCount ?? 0) : 0;

    if (prevStars !== null) {
      totalStars = totalStars - prevStars + stars;
    } else {
      totalStars += stars;
      reviewCount += 1;
    }

    const avgRating = reviewCount > 0 ? Math.round((totalStars / reviewCount) * 10) / 10 : 0;

    tx.set(ratingRef, { totalStars, reviewCount, avgRating });
    tx.set(reviewRef, {
      stars,
      comment: comment.trim(),
      timestamp: serverTimestamp(),
      spotTitle,
    });
  });
}
