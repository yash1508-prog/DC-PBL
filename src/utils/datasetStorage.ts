/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SensorRecord } from './csvHandler';

export interface StoredDataset {
  id: string; // 'active_dataset'
  fileName: string;
  csvContent: string;
  records: SensorRecord[];
  isNasaMillingDataset: boolean;
  minValue: number;
  maxValue: number;
  uploadedAt: string;
}

const DB_NAME = 'IndustrialSensorSimulatorDB';
const DB_VERSION = 1;
const STORE_NAME = 'savedDatasets';
const ACTIVE_KEY = 'active_dataset';

/**
 * Open or create the IndexedDB database instance
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error || new Error('Failed to open IndexedDB.'));
    };
  });
}

/**
 * Save or replace the uploaded CSV dataset in IndexedDB
 */
export async function saveDataset(data: {
  fileName: string;
  csvContent: string;
  records: SensorRecord[];
  isNasaMillingDataset: boolean;
  minValue: number;
  maxValue: number;
}): Promise<boolean> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: StoredDataset = {
        id: ACTIVE_KEY,
        fileName: data.fileName,
        csvContent: data.csvContent,
        records: data.records,
        isNasaMillingDataset: data.isNasaMillingDataset,
        minValue: data.minValue,
        maxValue: data.maxValue,
        uploadedAt: new Date().toISOString()
      };

      const putRequest = store.put(record);

      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = (e) => reject((e.target as IDBRequest).error);

      tx.oncomplete = () => db.close();
      tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    });
  } catch (err) {
    console.warn('Could not persist dataset to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieve the saved dataset from IndexedDB on page load / mount
 */
export async function loadDataset(): Promise<StoredDataset | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const getRequest = store.get(ACTIVE_KEY);

      getRequest.onsuccess = () => {
        const result = getRequest.result as StoredDataset | undefined;
        resolve(result || null);
      };

      getRequest.onerror = (e) => reject((e.target as IDBRequest).error);

      tx.oncomplete = () => db.close();
      tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    });
  } catch (err) {
    console.warn('Could not retrieve dataset from IndexedDB:', err);
    return null;
  }
}

/**
 * Permanently delete the stored dataset from IndexedDB
 */
export async function deleteDataset(): Promise<boolean> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const delRequest = store.delete(ACTIVE_KEY);

      delRequest.onsuccess = () => resolve(true);
      delRequest.onerror = (e) => reject((e.target as IDBRequest).error);

      tx.oncomplete = () => db.close();
      tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    });
  } catch (err) {
    console.warn('Could not delete dataset from IndexedDB:', err);
    return false;
  }
}
