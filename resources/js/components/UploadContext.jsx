import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

const UploadContext = createContext(null);

export const useUpload = () => useContext(UploadContext);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

// IndexedDB database functions
const DB_NAME = 'FreeHubUploadDB';
const STORE_NAME = 'uploads';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const saveToDB = async (item) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('IndexedDB save failed:', err);
  }
};

const removeFromDB = async (id) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('IndexedDB delete failed:', err);
  }
};

const loadAllFromDB = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('IndexedDB load failed:', err);
    return [];
  }
};

const formatTitleFromFilename = (filename) => {
  const name = filename.substring(0, filename.lastIndexOf('.')) || filename;
  const clean = name.replace(/[_-]/g, ' ');
  return clean.replace(/\b\w/g, c => c.toUpperCase());
};

export const UploadProvider = ({ children }) => {
    const [queue, setQueue] = useState([]);
    const [dbLoaded, setDbLoaded] = useState(false);
    const [activeUpload, setActiveUpload] = useState(null);
    const [lastCompletedUpload, setLastCompletedUpload] = useState(null);
    
    const abortControllers = useRef(new Map());
    const sessionStartTime = useRef(0);
    const sessionStartBytes = useRef(0);

    // Load queue from IndexedDB on startup
    useEffect(() => {
        const loadQueue = async () => {
            const items = await loadAllFromDB();
            const adjustedItems = items.map(item => {
                // If app was refreshed while uploading or waiting, set to waiting/paused
                if (item.status === 'uploading' || item.status === 'waiting') {
                    return { ...item, status: 'waiting', speed: 0, eta: 0 };
                }
                return item;
            });
            setQueue(adjustedItems);
            setDbLoaded(true);
        };
        loadQueue();
    }, []);

    // Helper: update item attributes in state
    const updateQueueItem = (id, fields) => {
        setQueue(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, ...fields };
                // Persist status updates to IndexedDB (omit heavy File object when completed)
                if (fields.status === 'completed' || fields.status === 'failed' || fields.status === 'paused' || fields.status === 'waiting') {
                    const dbCopy = { ...updated };
                    if (fields.status === 'completed') {
                        dbCopy.file = null; // Free file memory from DB
                    }
                    saveToDB(dbCopy);
                }
                return updated;
            }
            return item;
        }));
    };

    // Sequential Queue Processing
    useEffect(() => {
        if (!dbLoaded || activeUpload) return;

        // Find next waiting upload
        const nextUpload = queue.find(item => item.status === 'waiting');
        if (nextUpload) {
            setActiveUpload(nextUpload.id);
            processUpload(nextUpload.id);
        }
    }, [queue, activeUpload, dbLoaded]);

    const processUpload = async (id) => {
        const currentItem = queue.find(item => item.id === id);
        if (!currentItem || !currentItem.file) {
            setActiveUpload(null);
            return;
        }

        updateQueueItem(id, { status: 'uploading', speed: 0, eta: 0, error: null });

        let retryCount = 0;
        let chunkIndex = currentItem.chunkIndex || 0;
        const totalChunks = currentItem.totalChunks;
        
        sessionStartTime.current = Date.now();
        sessionStartBytes.current = chunkIndex * CHUNK_SIZE;

        try {
            // 1. Get Chunk status from Server for resumption support
            let statusRes;
            try {
                statusRes = await axios.get('/api/admin/uploads/chunk/status', {
                    params: {
                        file_id: currentItem.id,
                        filename: currentItem.filename
                    }
                });
                if (statusRes.data && typeof statusRes.data.next_chunk === 'number') {
                    chunkIndex = statusRes.data.next_chunk;
                    sessionStartBytes.current = chunkIndex * CHUNK_SIZE;
                }
            } catch (err) {
                console.error("Failed to query chunk status from server, starting from stored local index:", err);
            }

            // 2. Sequential Chunk uploads loop
            while (chunkIndex < totalChunks) {
                // Check abort status
                const controller = abortControllers.current.get(id);
                if (controller?.signal.aborted) {
                    break;
                }

                // Slice chunk
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(currentItem.file.size, start + CHUNK_SIZE);
                const chunkBlob = currentItem.file.slice(start, end);

                const formData = new FormData();
                formData.append('file_id', currentItem.id);
                formData.append('chunk_index', chunkIndex);
                formData.append('total_chunks', totalChunks);
                formData.append('filename', currentItem.filename);
                formData.append('file_type', currentItem.fileType);
                formData.append('title', currentItem.title || '');
                formData.append('description', currentItem.description || '');
                formData.append('file', chunkBlob, currentItem.filename);

                const newController = new AbortController();
                abortControllers.current.set(id, newController);

                try {
                    const response = await axios.post('/api/admin/uploads/chunk', formData, {
                        signal: newController.signal,
                        headers: { 'Content-Type': 'multipart/form-data' },
                        onUploadProgress: (progressEvent) => {
                            const chunkUploaded = progressEvent.loaded;
                            const currentTotalUploaded = start + chunkUploaded;
                            const percent = Math.min(99, Math.round((currentTotalUploaded * 100) / currentItem.totalBytes));
                            
                            const timeElapsed = (Date.now() - sessionStartTime.current) / 1000;
                            const bytesSinceStart = currentTotalUploaded - sessionStartBytes.current;
                            let speed = 0;
                            let eta = 0;
                            if (timeElapsed > 0.5) {
                                speed = Math.round(bytesSinceStart / timeElapsed);
                                const bytesRemaining = currentItem.totalBytes - currentTotalUploaded;
                                eta = speed > 0 ? Math.round(bytesRemaining / speed) : 0;
                            }

                            updateQueueItem(id, {
                                progress: percent,
                                uploadedBytes: currentTotalUploaded,
                                speed,
                                eta
                            });
                        }
                    });

                    // Success!
                    retryCount = 0; // reset retries
                    if (response.status === 201) {
                        // Merge finished, record created!
                        const resultModel = response.data.video || response.data.reel;
                        updateQueueItem(id, {
                            status: 'completed',
                            progress: 100,
                            speed: 0,
                            eta: 0,
                            result: resultModel
                        });
                        setLastCompletedUpload({
                            type: currentItem.fileType,
                            model: resultModel,
                            timestamp: Date.now()
                        });
                        break;
                    } else {
                        // Chunk saved successfully, update and continue
                        chunkIndex++;
                        // Periodically save progress/chunk state to DB
                        const updatedItemCopy = {
                            ...currentItem,
                            chunkIndex,
                            uploadedBytes: chunkIndex * CHUNK_SIZE,
                            progress: Math.min(99, Math.round((chunkIndex * CHUNK_SIZE * 100) / currentItem.totalBytes))
                        };
                        saveToDB(updatedItemCopy);
                    }

                } catch (err) {
                    if (axios.isCancel(err) || err.name === 'CanceledError' || newController.signal.aborted) {
                        console.log("Upload aborted:", id);
                        break;
                    }

                    console.error(`Error uploading chunk ${chunkIndex}:`, err);
                    retryCount++;
                    if (retryCount <= 3) {
                        console.log(`Retrying chunk ${chunkIndex} (Attempt ${retryCount}/3) in 2 seconds...`);
                        await new Promise(r => setTimeout(r, 2000));
                        // Re-initialize session time window
                        sessionStartTime.current = Date.now();
                        sessionStartBytes.current = chunkIndex * CHUNK_SIZE;
                    } else {
                        throw new Error(err.response?.data?.error || "Upload failed after 3 retries.");
                    }
                }
            }
        } catch (err) {
            updateQueueItem(id, {
                status: 'failed',
                error: err.message || "Upload failed."
            });
        } finally {
            abortControllers.current.delete(id);
            setActiveUpload(null);
        }
    };

    const pauseUpload = (id) => {
        const controller = abortControllers.current.get(id);
        if (controller) {
            controller.abort();
        }
        updateQueueItem(id, { status: 'paused', speed: 0, eta: 0 });
        if (activeUpload === id) {
            setActiveUpload(null);
        }
    };

    const resumeUpload = (id) => {
        updateQueueItem(id, { status: 'waiting', speed: 0, eta: 0, error: null });
    };

    const cancelUpload = (id) => {
        const controller = abortControllers.current.get(id);
        if (controller) {
            controller.abort();
        }
        removeFromDB(id);
        setQueue(prev => prev.filter(item => item.id !== id));
        if (activeUpload === id) {
            setActiveUpload(null);
        }
    };

    const retryUpload = (id) => {
        updateQueueItem(id, { status: 'waiting', progress: 0, uploadedBytes: 0, chunkIndex: 0, speed: 0, eta: 0, error: null });
    };

    const clearCompleted = () => {
        queue.forEach(item => {
            if (item.status === 'completed' || item.status === 'failed') {
                removeFromDB(item.id);
            }
        });
        setQueue(prev => prev.filter(item => item.status !== 'completed' && item.status !== 'failed'));
    };

    const addToQueue = async (files, fileType) => {
        const newItems = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const id = crypto.randomUUID ? crypto.randomUUID() : `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const title = formatTitleFromFilename(file.name);
            const item = {
                id,
                filename: file.name,
                fileType,
                title,
                description: '',
                file,
                progress: 0,
                uploadedBytes: 0,
                totalBytes: file.size,
                chunkIndex: 0,
                totalChunks: Math.ceil(file.size / CHUNK_SIZE),
                status: 'waiting',
                speed: 0,
                eta: 0,
                error: null
            };
            newItems.push(item);
            await saveToDB(item);
        }
        setQueue(prev => [...prev, ...newItems]);
    };

    return (
        <UploadContext.Provider value={{
            queue,
            activeUpload,
            lastCompletedUpload,
            setLastCompletedUpload,
            addToQueue,
            pauseUpload,
            resumeUpload,
            cancelUpload,
            retryUpload,
            clearCompleted
        }}>
            {children}
        </UploadContext.Provider>
    );
};
