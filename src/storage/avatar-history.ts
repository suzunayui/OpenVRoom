export interface AvatarEntry { id: string; name: string; size: number; updated: number }
const LIMIT_BYTES = 256 * 1024 * 1024;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('openvroom-avatars', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('entries', { keyPath: 'id' });
      request.result.createObjectStore('files');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('別のタブを閉じてから、もう一度お試しください。')); };
    request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, job: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(['entries', 'files'], mode); let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('履歴の保存容量が足りません。不要な履歴を削除してください。')); };
    tx.onerror = () => {}; // The abort handler reports a failed transaction.
    try { job(tx, result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
  });
}
export function listAvatars(): Promise<AvatarEntry[]> {
  return transaction('readonly', (tx, result) => {
    const request = tx.objectStore('entries').getAll();
    request.onsuccess = () => result((request.result as AvatarEntry[]).sort((a,b) => b.updated - a.updated));
  });
}
export async function saveAvatar(name: string, bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,'0')).join('');
  return transaction('readwrite', (tx, result) => {
    const entries = tx.objectStore('entries'); const request = entries.getAll();
    request.onsuccess = () => {
      const others = (request.result as AvatarEntry[]).filter(entry => entry.id !== id);
      if (others.length >= 20 || others.reduce((sum, entry) => sum + entry.size, 0) + bytes.byteLength > LIMIT_BYTES) { tx.abort(); return; }
      entries.put({ id, name, size: bytes.byteLength, updated: Date.now() } satisfies AvatarEntry);
      tx.objectStore('files').put(new Blob([bytes], { type: 'model/gltf-binary' }), id); result(id);
    };
  });
}
export async function readAvatar(id: string): Promise<ArrayBuffer> {
  const blob = await transaction<Blob | undefined>('readonly', (tx, result) => {
    const request = tx.objectStore('files').get(id); request.onsuccess = () => result(request.result);
  });
  if (!blob) throw new Error('この履歴は見つかりません。VRMをもう一度読み込んでください。');
  return blob.arrayBuffer();
}
export function deleteAvatar(id: string): Promise<void> {
  return transaction('readwrite', tx => { tx.objectStore('entries').delete(id); tx.objectStore('files').delete(id); });
}
