import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/* 
 * Configuração de Banco de Dados Direto (Sem persistência local no navegador):
 * Usa memoryLocalCache() para garantir que NENHUM dado fique gravado no navegador/disco local.
 * Tudo é gravado e sincronizado diretamente no banco de dados Firestore na nuvem.
 */
const customDbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
  },
  customDbId
);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Connection verification test per Firebase skill instructions
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is currently offline or unreachable.');
      return false;
    }
    return true;
  }
}

// Invoke on boot
testConnection();
