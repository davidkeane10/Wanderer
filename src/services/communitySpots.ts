import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";

export interface CommunitySpotInput {
  name: string;
  category: string;
  locationName: string;
  locationCoords: { latitude: number; longitude: number } | null;
  description: string;
  imageUri: string | null;
}

export async function submitCommunitySpot(input: CommunitySpotInput): Promise<void> {
  const userId = auth.currentUser?.uid ?? "anonymous";

  let imageUrl: string | null = null;
  if (input.imageUri) {
    try {
      const response = await fetch(input.imageUri);
      const blob = await response.blob();
      const storageRef = ref(storage, `community_spots/${userId}/${Date.now()}`);
      await uploadBytes(storageRef, blob);
      imageUrl = await getDownloadURL(storageRef);
    } catch (storageErr) {
      // Storage rules may not be configured — save the spot without the image
      if (__DEV__) console.warn("[CommunitySpots] Image upload failed, saving without image:", storageErr);
    }
  }

  await addDoc(collection(db, "community_spots"), {
    name: input.name.trim(),
    category: input.category,
    locationName: input.locationName.trim(),
    locationCoords: input.locationCoords,
    description: input.description.trim(),
    imageUrl,
    submittedBy: userId,
    submittedAt: serverTimestamp(),
    status: "pending",
  });
}
