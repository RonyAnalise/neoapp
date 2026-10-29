import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { AuditoriaLog } from '../types';
import { sanitizeForFirestore } from './cleanFirestore';

export async function logAuditEvent(
  params: Omit<AuditoriaLog, 'id' | 'timestamp'>
): Promise<void> {
  try {
    const sanitized = sanitizeForFirestore({
      ...params,
      timestamp: new Date().toISOString(),
    });
    await addDoc(collection(db, 'auditoria'), sanitized);
  } catch (error) {
    console.warn('Falha silenciosa ao registrar log de auditoria:', error);
  }
}
