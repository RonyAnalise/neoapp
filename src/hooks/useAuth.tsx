import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isOperator: boolean;
  loading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  adminCreateUser: (name: string, email: string, pass: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const BOOTSTRAP_ADMIN_EMAIL = 'ronycvcsales@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);

          const isBootstrapAdmin = user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            // Ensure bootstrap email is always admin
            if (isBootstrapAdmin && data.role !== 'admin') {
              data.role = 'admin';
              await setDoc(userDocRef, { ...data, role: 'admin' }, { merge: true });
              await setDoc(doc(db, 'admins', user.uid), { active: true, email: user.email }, { merge: true });
            }
            setUserProfile(data);
          } else {
            // New user registration profile
            const newProfile: UserProfile = {
              uid: user.uid,
              name: user.displayName || (isBootstrapAdmin ? 'Administrador Neo Energia' : user.email?.split('@')[0] || 'Usuário'),
              email: user.email || '',
              role: isBootstrapAdmin ? 'admin' : 'operator',
              active: true,
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            if (newProfile.role === 'admin') {
              await setDoc(doc(db, 'admins', user.uid), { active: true, email: user.email }, { merge: true });
            }
            setUserProfile(newProfile);
          }
        } catch (err) {
          console.error('Erro ao carregar perfil do usuário:', err);
          if (user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
            setUserProfile({
              uid: user.uid,
              name: 'Administrador Neo Energia',
              email: user.email || '',
              role: 'admin',
              active: true,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    const trimmedEmail = email.trim();
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, pass);
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      // Se for o e-mail do administrador provisionado e a conta ainda não existir no Auth, cria automaticamente no primeiro acesso com a senha fornecida!
      const isBootstrapAdmin = trimmedEmail.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
      if (
        isBootstrapAdmin &&
        (errObj.code === 'auth/user-not-found' ||
          errObj.code === 'auth/invalid-credential' ||
          errObj.code === 'auth/user-disabled')
      ) {
        try {
          const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
          const newProfile: UserProfile = {
            uid: cred.user.uid,
            name: 'Administrador Neo Energia',
            email: trimmedEmail,
            role: 'admin',
            active: true,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', cred.user.uid), newProfile);
          await setDoc(doc(db, 'admins', cred.user.uid), { active: true, email: trimmedEmail }, { merge: true });
          setUserProfile(newProfile);
          return;
        } catch (createErr) {
          throw err;
        }
      }
      throw err;
    }
  };

  // Função exclusiva para o Administrador cadastrar operadores e outros administradores internamente
  const adminCreateUser = async (name: string, email: string, pass: string, role: UserRole) => {
    const tempAppName = `AdminUserCreator_${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, tempAppName);
    try {
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), pass);

      const newProfile: UserProfile = {
        uid: cred.user.uid,
        name: name.trim(),
        email: email.trim(),
        role,
        active: true,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      if (role === 'admin') {
        await setDoc(doc(db, 'admins', cred.user.uid), { active: true, email: email.trim() }, { merge: true });
      }

      await fbSignOut(secondaryAuth);
    } finally {
      await deleteApp(secondaryApp);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const logout = async () => {
    await fbSignOut(auth);
    setUserProfile(null);
    setCurrentUser(null);
  };

  const isAdmin =
    userProfile?.role === 'admin' ||
    currentUser?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const isOperator = userProfile?.role === 'operator';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isAdmin,
        isOperator,
        loading,
        signInWithEmail,
        adminCreateUser,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
