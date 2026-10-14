import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { AuditoriaLog } from '../types';

export async function logAuditEvent(
  params: Omit<AuditoriaLog, 'id' | 'timestamp'>
): Promise<void> {
  try {
    await addDoc(collection(db, 'auditoria'), {
      ...params,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Falha silenciosa ao registrar log de auditoria:', error);
  }
}
