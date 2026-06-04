/**
 * Firebase Service Wrapper - Creative Production OS
 */
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, setDoc, getDocs, doc, getDoc, query, where, updateDoc, deleteDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCbdOF_2HROLUhUbYGQdQQG_6JL2OtyCeo",
  authDomain: "agencia-rconcept.firebaseapp.com",
  projectId: "agencia-rconcept",
  storageBucket: "agencia-rconcept.firebasestorage.app",
  messagingSenderId: "276644443381",
  appId: "1:276644443381:web:42a4eacd086fd5ad29c1bc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

export { db, auth, storage };

/**
 * Generic Database Service
 */
export const dbService = {
    async getAll(collectionName) {
        try {
            const querySnapshot = await getDocs(collection(db, collectionName));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            throw error;
        }
    },

    async getById(collectionName, id) {
        try {
            const docRef = doc(db, collectionName, id);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error(`Error fetching ${collectionName}/${id}:`, error);
            throw error;
        }
    },

    async getByQuery(collectionName, field, operator, value) {
        try {
            const q = query(collection(db, collectionName), where(field, operator, value));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error querying ${collectionName}:`, error);
            throw error;
        }
    },

    async add(collectionName, data) {
        try {
            const docRef = await addDoc(collection(db, collectionName), {
                ...data,
                createdAt: new Date().toISOString()
            });
            return docRef.id;
        } catch (error) {
            console.error(`Error adding to ${collectionName}:`, error);
            throw error;
        }
    },

    async set(collectionName, id, data) {
        try {
            await setDoc(doc(db, collectionName, id), {
                ...data,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return id;
        } catch (error) {
            console.error(`Error setting doc ${collectionName}/${id}:`, error);
            throw error;
        }
    },

    async update(collectionName, id, data) {
        try {
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, {
                ...data,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error(`Error updating ${collectionName}/${id}:`, error);
            throw error;
        }
    },

    async delete(collectionName, id) {
        try {
            await deleteDoc(doc(db, collectionName, id));
        } catch (error) {
            console.error(`Error deleting ${collectionName}/${id}:`, error);
            throw error;
        }
    }
};

/**
 * Auth Service
 */
export const authService = {
    onAuthChange(callback) {
        return onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Master hardcoded initial admin email (Strict exact matching to prevent privilege escalation)
                const normalizedEmail = user.email?.toLowerCase() || '';
                const isMasterAdmin = normalizedEmail === 'juanroblox89@gmail.com' || normalizedEmail === 'juanroblox89@rohlfing.com' || normalizedEmail === 'samuelrohlfing49@gmail.com';
                
                try {
                    const userDoc = await dbService.getById('users', user.uid);
                    if (!userDoc) {
                        // Create users/{uid} flow mandated by user
                        const newUser = {
                            uid: user.uid,
                            nombre: user.displayName || user.email?.split('@')[0] || 'Usuario',
                            email: user.email,
                            photoURL: user.photoURL || '',
                            createdAt: new Date().toISOString(),
                            approved: isMasterAdmin, // auto approve master admin
                            role: isMasterAdmin ? 'admin' : 'viewer'
                        };
                        await setDoc(doc(db, 'users', user.uid), newUser);
                        callback(newUser);
                    } else {
                        // If user is master admin but document doesn't reflect admin, fix it once
                        if (isMasterAdmin && userDoc.role !== 'admin') {
                            await dbService.update('users', user.uid, { role: 'admin', approved: true });
                            userDoc.role = 'admin';
                            userDoc.approved = true;
                        }
                        callback(userDoc);
                    }
                } catch (err) {
                    console.warn("Firestore access error fetching user, using master fallback:", err);
                    callback({
                        uid: user.uid,
                        nombre: user.displayName || user.email?.split('@')[0] || 'Usuario',
                        email: user.email,
                        photoURL: user.photoURL || '',
                        role: isMasterAdmin ? 'admin' : 'viewer',
                        approved: isMasterAdmin
                    });
                }
            } else {
                callback(null);
            }
        });
    },

    async loginWithGoogle() {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            return result.user;
        } catch (error) {
            console.error("Google login error:", error);
            throw error;
        }
    },

    async login(email, password) {
        return await signInWithEmailAndPassword(auth, email, password);
    },
    
    async getFreshUserDoc(uid) {
        return await dbService.getById('users', uid);
    },

    async logout() {
        return await signOut(auth);
    }
};

/**
 * Storage Service
 */
export const storageService = {
    async uploadFile(path, file) {
        try {
            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, file);
            return await getDownloadURL(snapshot.ref);
        } catch (err) {
            console.error("Firebase Storage upload error:", err);
            throw new Error("No se pudo subir el archivo: " + err.message);
        }
    },

    async getLogoUrl() {
        try {
            // Attempt to get dynamic brand logo from storage as requested
            const logoRef = ref(storage, 'logos/rohlfing-concept-logo.jpg');
            return await getDownloadURL(logoRef);
        } catch (err) {
            // Use static backup or base placeholder URL ensuring aesthetic excellence
            return null;
        }
    },

    async deleteFile(path) {
        try {
            const storageRef = ref(storage, path);
            await deleteObject(storageRef);
            console.log(`[Storage] Deleted file successfully: ${path}`);
            return true;
        } catch (err) {
            console.error(`Firebase Storage deletion error for path ${path}:`, err);
            return false;
        }
    }
};
