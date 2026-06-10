import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const UploadContext = createContext(null);

export const useUpload = () => useContext(UploadContext);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks

// ── IndexedDB helpers ──────────────────────────────────────────────────────
const DB_NAME  = 'FreeHubUploadDB';
const STORE_NAME = 'uploads';

const openDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
});

const saveToDB = async (item) => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            // Never persist the raw File object — it can't be serialised
            const safe = { ...item, file: null };
            const req  = store.put(safe);
            req.onsuccess = () => resolve();
            req.onerror   = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.warn('IndexedDB save failed:', err);
    }
};

const removeFromDB = async (id) => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(id).onsuccess = () => resolve();
            store.delete(id).onerror   = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.warn('IndexedDB delete failed:', err);
    }
};

const loadAllFromDB = async () => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req   = store.getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror   = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.warn('IndexedDB load failed:', err);
        return [];
    }
};

// ── Utility ────────────────────────────────────────────────────────────────
export const formatTitleFromFilename = (filename) => {
    const name  = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const clean = name.replace(/[_-]/g, ' ');
    return clean.replace(/\b\w/g, c => c.toUpperCase());
};

// ── Provider ───────────────────────────────────────────────────────────────
export const UploadProvider = ({ children }) => {
    const [queue, setQueue]       = useState([]);
    const [dbLoaded, setDbLoaded] = useState(false);
    const [activeUpload, setActiveUpload] = useState(null);
    const [lastCompletedUpload, setLastCompletedUpload] = useState(null);

    const abortControllers    = useRef(new Map());
    const sessionStartTime    = useRef(0);
    const sessionStartBytes   = useRef(0);
    const queueRef            = useRef([]);   // live mirror of queue for sync reads in async closures

    // ── Load queue from IndexedDB on startup ────────────────────────────
    useEffect(() => {
        const loadQueue = async () => {
            const items = await loadAllFromDB();
            const adjusted = items.map(item => {
                // After a page refresh, in-progress uploads go back to waiting
                if (item.status === 'uploading' || item.status === 'waiting') {
                    return { ...item, status: 'waiting', speed: 0, eta: 0, file: null };
                }
                // Processing items stay in processing so retriggerProcessing can handle them
                if (item.status === 'processing') {
                    return { ...item, speed: 0, eta: 0, file: null };
                }
                return { ...item, file: null };
            });
            queueRef.current = adjusted;
            setQueue(adjusted);
            setDbLoaded(true);
        };
        loadQueue();
    }, []);

    // ── Persist a queue item to IndexedDB (strip File object) ─────────
    const persistItem = useCallback((item) => {
        const safe = { ...item, file: null };
        saveToDB(safe);
    }, []);

    // ── Atomic queue update helper ─────────────────────────────────────
    const updateQueueItem = useCallback((id, fields) => {
        setQueue(prev => {
            const next = prev.map(item => {
                if (item.id !== id) return item;
                const updated = { ...item, ...fields };
                // Persist significant status changes to survive page reload
                const persistStatuses = ['completed', 'failed', 'paused', 'waiting', 'processing', 'cancelled'];
                if (fields.status && persistStatuses.includes(fields.status)) {
                    persistItem(updated);
                }
                return updated;
            });
            queueRef.current = next;
            return next;
        });
    }, [persistItem]);

    // ── Sequential queue processor ────────────────────────────────────
    useEffect(() => {
        if (!dbLoaded || activeUpload) return;

        // Resume any item stuck in 'processing' (e.g., page refreshed mid-process)
        const processingItem = queue.find(i => i.status === 'processing');
        if (processingItem) {
            setActiveUpload(processingItem.id);
            retriggerProcessing(processingItem.id);
            return;
        }

        // Pick next waiting upload
        const nextItem = queue.find(i => i.status === 'waiting');
        if (nextItem) {
            setActiveUpload(nextItem.id);
            runUpload(nextItem.id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queue, activeUpload, dbLoaded]);

    // ── Re-trigger processing after page refresh ───────────────────────
    const retriggerProcessing = async (id) => {
        const item = queue.find(i => i.id === id);
        if (!item) { setActiveUpload(null); return; }

        try {
            const res = await axios.get('/api/admin/uploads/chunk/status', {
                params: { file_id: item.id, filename: item.filename }
            });

            const serverStatus = res.data.status;

            if (serverStatus === 'published') {
                updateQueueItem(id, { status: 'completed', progress: 100, speed: 0, eta: 0 });
                setActiveUpload(null);
                return;
            }

            if (serverStatus === 'uploaded' || serverStatus === 'processing') {
                updateQueueItem(id, { status: 'processing', progress: 100, speed: 0, eta: 0 });
                await callProcessEndpoint(id, item);
                return;
            }

            // Still needs uploading — reset to waiting
            updateQueueItem(id, { status: 'waiting' });
            setActiveUpload(null);
        } catch (err) {
            console.error('Failed to retrigger processing:', err);
            updateQueueItem(id, { status: 'failed', error: 'Failed to resume processing.' });
            setActiveUpload(null);
        }
    };

    // ── Call the server-side FFmpeg / DB creation endpoint ─────────────
    const callProcessEndpoint = async (id, item) => {
        try {
            const response = await axios.post(`/api/admin/uploads/${item.id}/process`, null, {
                timeout: 0 // Prevent timeouts during potentially long-running FFmpeg process
            });

            const resultModel = response.data.video || response.data.reel;
            updateQueueItem(id, {
                status: 'completed',
                progress: 100,
                speed: 0,
                eta: 0,
                result: resultModel,
            });
            setLastCompletedUpload({
                type: item.fileType,
                model: resultModel,
                temp_thumbnails: response.data.temp_thumbnails || [],
                timestamp: Date.now(),
            });
        } catch (err) {
            console.error('Processing failed:', err);
            updateQueueItem(id, {
                status: 'failed',
                error: err.response?.data?.error || 'Processing failed on server.',
            });
        } finally {
            setActiveUpload(null);
        }
    };

    // ── Main upload runner — chunk loop + processing ───────────────────
    const runUpload = async (id) => {
        // Read current item synchronously from the live queue mirror
        const currentItem = queueRef.current.find(i => i.id === id);

        if (!currentItem || !currentItem.file) {
            // File reference lost (e.g., restored from IndexedDB after refresh)
            // We can't upload without the File object — mark as failed with helpful message
            updateQueueItem(id, {
                status: 'failed',
                error: 'File reference lost after page reload. Please re-add the file to upload.',
            });
            setActiveUpload(null);
            return;
        }

        updateQueueItem(id, { status: 'uploading', speed: 0, eta: 0, error: null });

        let retryCount = 0;
        let chunkIndex = currentItem.chunkIndex || 0;
        let uploadedChunks = [];
        const totalChunks = currentItem.totalChunks;

        sessionStartTime.current  = Date.now();
        sessionStartBytes.current = chunkIndex * CHUNK_SIZE;

        try {
            // 1. Check server-side chunk status for resumption
            try {
                const statusRes = await axios.get('/api/admin/uploads/chunk/status', {
                    params: { file_id: currentItem.id, filename: currentItem.filename }
                });
                const serverStatus = statusRes.data.status;

                if (serverStatus === 'published') {
                    updateQueueItem(id, { status: 'completed', progress: 100, speed: 0, eta: 0 });
                    setActiveUpload(null);
                    return;
                }
                if (serverStatus === 'uploaded') {
                    updateQueueItem(id, { status: 'processing', progress: 100, speed: 0, eta: 0 });
                    await callProcessEndpoint(id, currentItem);
                    return;
                }
                if (serverStatus === 'cancelled') {
                    updateQueueItem(id, { status: 'cancelled', error: 'Cancelled on server.' });
                    setActiveUpload(null);
                    return;
                }
                if (statusRes.data.uploaded_chunks) {
                    uploadedChunks = statusRes.data.uploaded_chunks.map(Number);
                }
                if (typeof statusRes.data.next_chunk === 'number') {
                    chunkIndex = statusRes.data.next_chunk;
                    sessionStartBytes.current = chunkIndex * CHUNK_SIZE;
                }
            } catch (err) {
                console.warn('Could not query chunk status; starting from stored local index:', err);
            }

            // 2. Sequential chunk upload loop
            while (chunkIndex < totalChunks) {
                const controller = abortControllers.current.get(id);
                if (controller?.signal.aborted) break;

                // Skip this chunk if it has already been successfully uploaded to the server
                if (uploadedChunks.includes(chunkIndex)) {
                    console.log(`Chunk ${chunkIndex} already uploaded, skipping.`);
                    chunkIndex++;
                    const skippedBytes = Math.min(currentItem.file.size, chunkIndex * CHUNK_SIZE);
                    const percent = Math.min(99, Math.round((skippedBytes * 100) / currentItem.totalBytes));

                    updateQueueItem(id, { progress: percent, uploadedBytes: skippedBytes });

                    // Keep IndexedDB progress state in sync
                    const live = queueRef.current.find(i => i.id === id);
                    if (live) {
                        saveToDB({
                            ...live,
                            chunkIndex,
                            uploadedBytes: skippedBytes,
                            progress: percent,
                            file: null,
                        });
                    }
                    continue;
                }

                const start     = chunkIndex * CHUNK_SIZE;
                const end       = Math.min(currentItem.file.size, start + CHUNK_SIZE);
                const chunkBlob = currentItem.file.slice(start, end);

                const formData = new FormData();
                formData.append('file_id',       currentItem.id);
                formData.append('chunk_index',   chunkIndex);
                formData.append('total_chunks',  totalChunks);
                formData.append('filename',      currentItem.filename);
                formData.append('file_type',     currentItem.fileType);
                formData.append('title',         currentItem.title || '');
                formData.append('description',   currentItem.description || '');
                formData.append('file',          chunkBlob, currentItem.filename);

                const newController = new AbortController();
                abortControllers.current.set(id, newController);

                try {
                    const response = await axios.post('/api/admin/uploads/chunk', formData, {
                        signal: newController.signal,
                        headers: { 'Content-Type': 'multipart/form-data' },
                        timeout: 0, // Ensure no timeout limit on the client side
                        onUploadProgress: (progressEvent) => {
                            const chunkUploaded       = progressEvent.loaded;
                            const currentTotalUploaded = start + chunkUploaded;
                            const percent = Math.min(99, Math.round((currentTotalUploaded * 100) / currentItem.totalBytes));

                            const timeElapsed      = (Date.now() - sessionStartTime.current) / 1000;
                            const bytesSinceStart  = currentTotalUploaded - sessionStartBytes.current;
                            let speed = 0, eta = 0;
                            if (timeElapsed > 0.5) {
                                speed = Math.round(bytesSinceStart / timeElapsed);
                                const bytesRemaining = currentItem.totalBytes - currentTotalUploaded;
                                eta = speed > 0 ? Math.round(bytesRemaining / speed) : 0;
                            }

                            updateQueueItem(id, { progress: percent, uploadedBytes: currentTotalUploaded, speed, eta });
                        }
                    });

                    retryCount = 0; // reset on success

                    if (response.data.status === 'uploaded') {
                        // All chunks received — move to processing
                        updateQueueItem(id, { status: 'processing', progress: 100, speed: 0, eta: 0 });
                        await callProcessEndpoint(id, currentItem);
                        return;
                    } else {
                        // Chunk saved — continue
                        chunkIndex++;
                        // Persist progress periodically using the live queue mirror
                        const live = queueRef.current.find(i => i.id === id);
                        if (live) {
                            saveToDB({
                                ...live,
                                chunkIndex,
                                uploadedBytes: chunkIndex * CHUNK_SIZE,
                                progress: Math.min(99, Math.round((chunkIndex * CHUNK_SIZE * 100) / currentItem.totalBytes)),
                                file: null,
                            });
                        }
                    }

                } catch (err) {
                    if (axios.isCancel(err) || err.name === 'CanceledError' || newController.signal.aborted) {
                        break;
                    }
                    
                    const responseError = err.response?.data?.error || err.response?.data?.message || err.message;
                    console.error(`Chunk ${chunkIndex} error:`, {
                        message: err.message,
                        status: err.response?.status,
                        statusText: err.response?.statusText,
                        body: err.response?.data,
                    });

                    retryCount++;
                    if (retryCount <= 3) {
                        await new Promise(r => setTimeout(r, 2000 * retryCount));
                        sessionStartTime.current  = Date.now();
                        sessionStartBytes.current = chunkIndex * CHUNK_SIZE;
                    } else {
                        throw new Error(responseError || 'Upload failed after 3 retries.');
                    }
                }
            }
        } catch (err) {
            updateQueueItem(id, { status: 'failed', error: err.message || 'Upload failed.' });
        } finally {
            abortControllers.current.delete(id);
            setActiveUpload(prev => prev === id ? null : prev);
        }
    };

    // ── Queue actions ──────────────────────────────────────────────────

    const pauseUpload = useCallback((id) => {
        const ctrl = abortControllers.current.get(id);
        if (ctrl) ctrl.abort();
        updateQueueItem(id, { status: 'paused', speed: 0, eta: 0 });
        setActiveUpload(prev => prev === id ? null : prev);
    }, [updateQueueItem]);

    const resumeUpload = useCallback((id) => {
        updateQueueItem(id, { status: 'waiting', speed: 0, eta: 0, error: null });
    }, [updateQueueItem]);

    const cancelUpload = useCallback((id) => {
        const ctrl = abortControllers.current.get(id);
        if (ctrl) ctrl.abort();

        // Notify server to mark as cancelled (fire-and-forget)
        axios.delete(`/api/admin/uploads/${id}/cancel`).catch(() => {});

        updateQueueItem(id, { status: 'cancelled', speed: 0, eta: 0, error: null });
        setActiveUpload(prev => prev === id ? null : prev);
    }, [updateQueueItem]);

    const retryUpload = useCallback((id) => {
        updateQueueItem(id, {
            status: 'waiting',
            progress: 0,
            uploadedBytes: 0,
            chunkIndex: 0,
            speed: 0,
            eta: 0,
            error: null,
        });
    }, [updateQueueItem]);

    const removeFromQueue = useCallback((id) => {
        const ctrl = abortControllers.current.get(id);
        if (ctrl) ctrl.abort();
        removeFromDB(id);
        setQueue(prev => {
            const next = prev.filter(item => item.id !== id);
            queueRef.current = next;
            return next;
        });
        setActiveUpload(prev => prev === id ? null : prev);
    }, []);

    // ── Bulk queue actions ─────────────────────────────────────────────

    const pauseAll = useCallback(() => {
        setQueue(prev => {
            const updated = prev.map(item => {
                if (item.status === 'uploading' || item.status === 'waiting') {
                    const ctrl = abortControllers.current.get(item.id);
                    if (ctrl) ctrl.abort();
                    const u = { ...item, status: 'paused', speed: 0, eta: 0 };
                    persistItem(u);
                    return u;
                }
                return item;
            });
            queueRef.current = updated;
            return updated;
        });
        setActiveUpload(null);
    }, [persistItem]);

    const resumeAll = useCallback(() => {
        setQueue(prev => {
            const next = prev.map(item => {
                if (item.status === 'paused') {
                    const u = { ...item, status: 'waiting', speed: 0, eta: 0, error: null };
                    persistItem(u);
                    return u;
                }
                return item;
            });
            queueRef.current = next;
            return next;
        });
    }, [persistItem]);

    const cancelAll = useCallback(() => {
        setQueue(prev => {
            const next = prev.map(item => {
                if (['uploading', 'waiting', 'paused', 'processing'].includes(item.status)) {
                    const ctrl = abortControllers.current.get(item.id);
                    if (ctrl) ctrl.abort();
                    axios.delete(`/api/admin/uploads/${item.id}/cancel`).catch(() => {});
                    const u = { ...item, status: 'cancelled', speed: 0, eta: 0 };
                    persistItem(u);
                    return u;
                }
                return item;
            });
            queueRef.current = next;
            return next;
        });
        setActiveUpload(null);
    }, [persistItem]);

    const clearCompleted = useCallback(() => {
        setQueue(prev => {
            const toRemove = prev.filter(i =>
                i.status === 'completed' || i.status === 'cancelled' || i.status === 'failed'
            );
            toRemove.forEach(i => removeFromDB(i.id));
            const next = prev.filter(i =>
                i.status !== 'completed' && i.status !== 'cancelled' && i.status !== 'failed'
            );
            queueRef.current = next;
            return next;
        });
    }, []);

    // ── Add files to queue ─────────────────────────────────────────────

    const addToQueue = useCallback(async (files, fileType) => {
        const newItems = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const id   = crypto.randomUUID
                ? crypto.randomUUID()
                : `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const title = formatTitleFromFilename(file.name);
            const item = {
                id,
                filename:      file.name,
                fileType,
                title,
                description:   '',
                file,                        // live File reference
                progress:      0,
                uploadedBytes: 0,
                totalBytes:    file.size,
                chunkIndex:    0,
                totalChunks:   Math.ceil(file.size / CHUNK_SIZE),
                status:        'waiting',
                speed:         0,
                eta:           0,
                error:         null,
            };
            newItems.push(item);
            // Persist metadata (without File object)
            saveToDB({ ...item, file: null });
        }
        setQueue(prev => {
            const next = [...prev, ...newItems];
            queueRef.current = next;
            return next;
        });
    }, []);

    // ── Context value ──────────────────────────────────────────────────

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
            removeFromQueue,
            pauseAll,
            resumeAll,
            cancelAll,
            clearCompleted,
        }}>
            {children}
        </UploadContext.Provider>
    );
};
