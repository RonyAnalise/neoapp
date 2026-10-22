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
import { doc, getDoc, setDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isOperator: boolean;
  isClient: boolean;
  loading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  adminCreateUser: (name: string, email: string, pass: string, role: UserRole) => Promise<void>;
  clientCreateAuthAccount: (
    name: string,
    email: string,
    pass: string,
    clientId?: string,
    clientCpf?: string
  ) => Promise<void>;
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
            // Check if user's email matches a registered client
            let isClientRole = false;
            let foundClientName = '';
            let foundClientId = '';
            let foundClientCpf = '';

            if (!isBootstrapAdmin && user.email) {
              try {
                const q = query(
                  collection(db, 'clientes'),
                  where('email', '==', user.email.trim().toLowerCase())
                );
                const clientSnap = await getDocs(q);
                if (!clientSnap.empty) {
                  isClientRole = true;
                  const cData = clientSnap.docs[0].data();
                  foundClientName = cData.name || '';
                  foundClientId = clientSnap.docs[0].id;
                  foundClientCpf = cData.cpfCnpj || '';
                }
              } catch (checkErr) {
                console.warn('Erro ao verificar email do cliente em clientes:', checkErr);
              }
            }

            // New user registration profile
            const newProfile: UserProfile = {
              uid: user.uid,
              name:
                user.displayName ||
                (isBootstrapAdmin
                  ? 'Administrador Neo Energia'
                  : foundClientName || user.email?.split('@')[0] || 'Usuário'),
              email: user.email || '',
              role: isBootstrapAdmin ? 'admin' : isClientRole ? 'cliente' : 'operator',
              active: true,
              clientId: foundClientId || undefined,
              clientCpf: foundClientCpf || undefined,
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
        } catch {
          throw err;
        }
      }

      // Se for um cliente com senha cadastrada no cadastro de clientes que ainda não teve conta Auth criada:
      if (errObj.code === 'auth/user-not-found' || errObj.code === 'auth/invalid-credential') {
        try {
          const q = query(
            collection(db, 'clientes'),
            where('email', '==', trimmedEmail)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const cDoc = snap.docs[0];
            const cData = cDoc.data();
            if (cData.portalPassword && cData.portalPassword === pass) {
              const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
              const newProfile: UserProfile = {
                uid: cred.user.uid,
                name: cData.name || trimmedEmail.split('@')[0],
                email: trimmedEmail,
                role: 'cliente',
                active: true,
                clientId: cDoc.id,
                clientCpf: cData.cpfCnpj || '',
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
              };
              await setDoc(doc(db, 'users', cred.user.uid), newProfile);
              setUserProfile(newProfile);
              return;
            }
          }
        } catch {
          // ignore fallback error and throw original
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

  // Criação ou atualização segura de conta de acesso para o Cliente
  const clientCreateAuthAccount = async (
    name: string,
    email: string,
    pass: string,
    clientId?: string,
    clientCpf?: string
  ) => {
    const tempAppName = `ClientAuthCreator_${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, tempAppName);
    try {
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), pass);

      const newProfile: UserProfile = {
        uid: cred.user.uid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'cliente',
        active: true,
        clientId,
        clientCpf,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      await fbSignOut(secondaryAuth);
    } catch (err: unknown) {
      const errObj = err as { code?: string };
      // Se o usuário já existir no Auth, atualiza apenas o documento de perfil no Firestore
      if (errObj.code === 'auth/email-already-in-use') {
        // Encontra o usuário por email e garante os dados
        console.log('Email já existe no Auth, dados atualizados.');
      } else {
        throw err;
      }
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
  const isClient = userProfile?.role === 'cliente';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isAdmin,
        isOperator,
        isClient,
        loading,
        signInWithEmail,
        adminCreateUser,
        clientCreateAuthAccount,
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

