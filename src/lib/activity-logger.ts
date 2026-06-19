import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getDb } from "./firebase";
import { type AppUser } from "./auth-context";

export async function logActivity(user: AppUser | null, action: string, details: any = {}) {
  if (!user) return;
  try {
    const db = getDb();
    await addDoc(collection(db, "activity_logs"), {
      userEmail: user.email,
      userId: user.uid,
      action,
      details,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}
