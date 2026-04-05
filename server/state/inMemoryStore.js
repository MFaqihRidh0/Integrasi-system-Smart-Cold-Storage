class InMemoryStore {
    constructor() {
        // Map: storageId -> StorageData
        this.storages = new Map();

        // Map: batchId -> BatchData
        this.batches = new Map();

        // Array: Semua alerts aktif dan terhistori
        this.alerts = [];

        // Map: storageId -> Array of TelemetryReadings (history)
        this.telemetryHistory = new Map();

        // Set: Active watchers untuk Server-Side Streaming
        this.alertWatchers = new Set();

        console.log('[InMemoryStore] Initialized');
    }

    //Storage Management

    /**
     * Registrasi storage baru ke sistem
     */
    registerStorages(storageId, config = {}) {
        if (!this.storages.has(storageId)) {
            this.storages.set(storageId, {
                storage_id: storageId,
                current_temp: null,
                current_humidity: null,
                current_pressure: null,
                status: 'Offline', // Set value awal di offline
                last_update: null,
                created_at: Date.now(),
                batches: [],
                config: {
                    min_temp: config.min_temp || -25.0,
                    max_temp: config.max_temp || 10.0,
                    max_humidity: config.max_humidity || 60.0,
                    ...config
                },
                statistics: {
                    total_readings: 0,
                    anomalies_detected: 0,
                    uptime_start: null
                }
            });
            this.telemetryHistory.set(storageId, []);
            console.log(`[InMemoryStore] Storage ${storageId} registered`);
            return true;
        }
        return false;
    }

    /**
     * Ambil data storage
     */
    getStorage(storageId) {
        return this.storages.get(storageId);
    }

    /**
     * Ambil semua storage
     */
    getAllStorages() {
        return Array.from(this.storages.values());
    }

    /**
     * Update status storage (dipanggil oleh monitoring logic)
     */
    updateStorageStatus(storageId, updates) {
        const storage = this.storages.get(storageId);
        if (storage) {
            Object.assign(storage, updates);
            storage.last_update = Date.now();
            if (!storage.statistics.uptime_start) {
                storage.statistics.uptime_start = Date.now();
            }
        }
        return storage;
    }

    //Inventory atau Batch Management

    /**
     * Tambah batch baru ke fridge
     */
    addBatch(storageId, batch) {
        const storage = this.storages.get(storageId);
        if (!storage) {
            throw new Error(`Storage ${storageId} not found`);
        }

        if (this.batches.has(batch.batch_id)) {
            throw new Error(`Batch ${batch.batch_id} already exists`);
        }

        const batchData = {
            ...batch,
            registered_at: Date.now(),
            storage_id: storageId
        };

        this.batches.set(batch.batch_id, batchData);
        storage.batches.push(batchData);

        console.log(`[InMemoryStore] Batch ${batch.batch_id} added to ${storageId}`);
        return batchData;
    }

    /**
     * Ambil batch berdasarkan ID
     */
    getBatch(batchId) {
        return this.batches.get(batchId);
    }

    /**
     * Cek apakah batch ada
     */
    batchExists(batchId) {
        return this.batches.has(batchId);
    }

    /**
     * Hapus batch dari sistem
     */
    removeBatch(batchId, reason = '') {
        const batch = this.batches.get(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }

        const storage = this.storages.get(batch.storage_id);
        if (storage) {
            storage.batches = storage.batches.filter(b => b.batch_id !== batchId);
        }

        this.batches.delete(batchId);
        console.log(`[InMemoryStore] Batch ${batchId} removed. Reason: ${reason}`);
        return true;
    }

    /**
     * Ambil semua batch di satu fridge
     */
    getBatchesByStorage(storageId) {
        const storage = this.storages.get(storageId);
        return storage ? storage.batches : [];
    }

    //Telemetry / Monitoring

    /**
     * Simpan reading telemetry ke history
     */
    addTelemetryReading(storageId, reading) {
        if (!this.telemetryHistory.has(storageId)) {
            this.telemetryHistory.set(storageId, []);
        }

        const history = this.telemetryHistory.get(storageId);
        history.push({
            temperature: reading.temperature,
            humidity: reading.humidity,
            pressure: reading.pressure,
            timestamp: reading.timestamp || Date.now()
        });

        // Batasi history size (keep last 10000 readings)
        if (history.length > 10000) {
            history.shift();
        }

        // Update counter
        const storage = this.storages.get(storageId);
        if (storage) {
            storage.statistics.total_readings++;
        }

        return reading;
    }

    /**
     * Ambil history telemetry untuk satu fridge
     */
    getTelemetryHistory(storageId, startTime = 0, endTime = Infinity, limit = 1000) {
        const history = this.telemetryHistory.get(storageId) || [];

        let filtered = history.filter(r =>
            r.timestamp >= startTime && r.timestamp <= endTime
        );

        // Ambil terakhir (most recent first)
        filtered = filtered.slice(-limit).reverse();

        return filtered;
    }
    /**
     * Tambah alert baru
     */
    addAlert(alert) {
        const alertData = {
            ...alert,
            alert_id: alert.alert_id || `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            triggered_at: alert.triggered_at || Date.now(),
            resolved: false,
            resolved_at: null,
            resolved_by: null
        };

        this.alerts.push(alertData);

        // Update anomaly counter di storage
        const storage = this.storages.get(alert.storage_id);
        if (storage) {
            storage.statistics.anomalies_detected++;
        }

        // Notify watchers (untuk Server-Side Streaming)
        this._notifyWatchers(alertData, 'NEW');

        console.log(`[InMemoryStore] Alert ${alertData.alert_id} added: ${alert.message}`);
        return alertData;
    }

    /**
     * Resolve alert
     */
    resolveAlert(alertId, resolvedBy, notes = '') {
        const alert = this.alerts.find(a => a.alert_id === alertId);
        if (!alert) {
            throw new Error(`Alert ${alertId} not found`);
        }

        alert.resolved = true;
        alert.resolved_at = Date.now();
        alert.resolved_by = resolvedBy;
        alert.resolution_notes = notes;

        // Notify watchers
        this._notifyWatchers(alert, 'RESOLVED');

        console.log(`[InMemoryStore] Alert ${alertId} resolved by ${resolvedBy}`);
        return alert;
    }

    /**
     * Ambil alerts dengan filter
     */
    getAlerts(filters = {}) {
        let filtered = [...this.alerts];

        if (filters.storage_id) {
            filtered = filtered.filter(a => a.storage_id === filters.storage_id);
        }

        if (filters.severity !== undefined && filters.severity !== null) {
            filtered = filtered.filter(a => a.severity === filters.severity);
        }

        if (filters.resolved_only) {
            filtered = filtered.filter(a => a.resolved === true);
        } else if (filters.resolved_only === false) {
            filtered = filtered.filter(a => a.resolved === false);
        }

        // Sort by most recent first
        filtered.sort((a, b) => b.triggered_at - a.triggered_at);

        return filtered;
    }

    /**
     * Ambil alerts yang belum resolved
     */
    getActiveAlerts() {
        return this.alerts.filter(a => !a.resolved);
    }

    // Alert Watchers untuk sisi Client Side Streaming

    /**
     * Register watcher untuk real-time alerts
     */
    addAlertWatcher(writeCallback) {
        this.alertWatchers.add(writeCallback);
        console.log(`[InMemoryStore] Alert watcher added. Total: ${this.alertWatchers.size}`);
        return writeCallback;
    }

    /**
     * Remove watcher
     */
    removeAlertWatcher(writeCallback) {
        this.alertWatchers.delete(writeCallback);
        console.log(`[InMemoryStore] Alert watcher removed. Total: ${this.alertWatchers.size}`);
    }

    /**
     * Push notification ke semua watchers
     */
    _notifyWatchers(alert, notificationType) {
        const notification = {
            alert: alert,
            notification_type: notificationType
        };

        this.alertWatchers.forEach(write => {
            try {
                write(notification);
            } catch (err) {
                console.error('[InMemoryStore] Error notifying watcher:', err.message);
                // Auto-remove broken watchers
                this.alertWatchers.delete(write);
            }
        });
    }

    //Utility & debug

    /**
     * Get system statistics
     */
    getSystemStats() {
        const now = Date.now();
        let totalUptime = 0;
        let activeStorages = 0;

        this.storages.forEach(storage => {
            if (storage.status === 'Online') {
                activeStorages++;
                if (storage.statistics.uptime_start) {
                    totalUptime += (now - storage.statistics.uptime_start);
                }
            }
        });

        return {
            total_storages: this.storages.size,
            active_storages: activeStorages,
            total_batches: this.batches.size,
            total_alerts: this.alerts.length,
            active_alerts: this.getActiveAlerts().length,
            total_telemetry_points: Array.from(this.telemetryHistory.values())
                .reduce((sum, arr) => sum + arr.length, 0),
            alert_watchers: this.alertWatchers.size
        };
    }

    /**
     * Clear all data (for testing/reset)
     */
    clearAll() {
        this.storages.clear();
        this.batches.clear();
        this.alerts = [];
        this.telemetryHistory.clear();
        this.alertWatchers.clear();
        console.log('[InMemoryStore] All data cleared');
    }
}

// Singleton instance
const store = new InMemoryStore();

module.exports = store;