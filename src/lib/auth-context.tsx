import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { firebaseConfigured, getFirebaseAuth, getDb } from "./firebase";

export type Role = "admin" | "employee";

export interface AppUser {
  uid: string;
  email: string;
  role: Role;
  fullName?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const db = getDb();
        const roleSnap = await getDoc(doc(db, "roles", fbUser.uid));
        const empSnap = await getDoc(doc(db, "employees", fbUser.uid));
        const role = (roleSnap.exists() ? (roleSnap.data().role as Role) : "employee");
        setUser({
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          role,
          fullName: empSnap.exists() ? (empSnap.data().fullName as string) : undefined,
        });
      } catch (e) {
        console.error("Failed to load user profile", e);
        setUser({
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          role: "employee",
        });
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const db = getDb();
    // Determine role: if no admin exists yet, this user becomes admin.
    const adminQ = query(
      collection(db, "roles"),
      where("role", "==", "admin"),
      limit(1),
    );
    const adminSnap = await getDocs(adminQ);
    const role: Role = adminSnap.empty ? "admin" : "employee";

    const cred = await createUserWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password,
    );
    const uid = cred.user.uid;
    await setDoc(doc(db, "roles", uid), { role, email });
    await setDoc(doc(db, "employees", uid), {
      employeeId: uid,
      fullName,
      email,
      phone: "",
      department: "",
      designation: "",
      joiningDate: new Date().toISOString().split("T")[0],
      status: "active",
      profileImage: "",
      createdAt: serverTimestamp(),
    });
  };

  const signInWithGoogle = async () => {
    const db = getDb();
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(getFirebaseAuth(), provider);
    const { uid, email, displayName } = cred.user;

    // Check if user already has a role assigned
    const roleSnap = await getDoc(doc(db, "roles", uid));
    if (!roleSnap.exists()) {
      // First Google sign-up: determine role (first user = admin)
      const adminQ = query(
        collection(db, "roles"),
        where("role", "==", "admin"),
        limit(1),
      );
      const adminSnap = await getDocs(adminQ);
      const role: Role = adminSnap.empty ? "admin" : "employee";

      await setDoc(doc(db, "roles", uid), { role, email });
      await setDoc(doc(db, "employees", uid), {
        employeeId: uid,
        fullName: displayName ?? "",
        email: email ?? "",
        phone: "",
        department: "",
        designation: "",
        joiningDate: new Date().toISOString().split("T")[0],
        status: "active",
        profileImage: cred.user.photoURL ?? "",
        createdAt: serverTimestamp(),
      });
    }
  };

  const signOut = async () => {
    await fbSignOut(getFirebaseAuth());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        configured: firebaseConfigured,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}