/**
 * ============================================================
 *  CryoMedics - In-Memory Store
 * ============================================================
 *  Centralized state management untuk seluruh data sistem.
 *  Menyimpan data storages, batches, alerts, telemetry, dsb.
 * ============================================================
 */

const { v4: uuidv4 } = require('uuid');

class InMemoryStore {
    constructor() {
        // Storage units (kulkas medis)
        // Key: storage_id, Value: { storage_id, current_temp, current_humidity, status, last_update, batch_count }
        this.storages = new Map();

        // Batch inventory
        // Key: batch_id, Value: StockBatch object
        this.batches = new Map();

        // Alert list
        this.alerts = [];

        // Telemetry readings history
        // Key: storage_id, Value: Array of { temperature, humidity, pressure, timestamp, sensor_id }
        this.telemetryHistory = new Map();

        // Server-side streaming alert watchers
        // Key: watcher_id, Value: { call, minSeverity }
        this.alertWatchers = new Map();

        // Inisialisasi default storages (3 kulkas medis)
        this._initDefaultStorages();
    }

    /**
     * Inisialisasi 3 kulkas medis default
     */
    _initDefaultStorages() {
        const defaultStorages = [
            {
                storage_id: 'FRIDGE-001',
                current_temp: -20.0,
                current_humidity: 45.0,
                status: 'NORMAL',
                last_update: Date.now(),
                batch_count: 0
            },
            {
                storage_id: 'FRIDGE-002',
                current_temp: 4.0,
                current_humidity: 50.0,
                status: 'NORMAL',
                last_update: Date.now(),
                batch_count: 0
            },
            {
                storage_id: 'FRIDGE-003',
                current_temp: -70.0,
                current_humidity: 30.0,
                status: 'NORMAL',
                last_update: Date.now(),
                batch_count: 0
            }
        ];

        defaultStorages.forEach(s => {
            this.storages.set(s.storage_id, s);
            this.telemetryHistory.set(s.storage_id, []);
        });

        console.log(`[InMemoryStore] Initialized ${defaultStorages.length} default storage units`);
    }

    // ===================== STORAGE METHODS =====================

    getStorage(storageId) {
        return this.storages.get(storageId) || null;
    }

    getAllStorages() {
        return Array.from(this.storages.values());
    }

    updateStorageStatus(storageId, temp, humidity, status) {
        const storage = this.storages.get(storageId);
        if (storage) {
            storage.current_temp = temp;
            storage.current_humidity = humidity;
            storage.status = status;
            storage.last_update = Date.now();
        }
    }

    // ===================== BATCH METHODS =====================

    addBatch(batch) {
        this.batches.set(batch.batch_id, batch);

        // Update batch count di storage
        const storage = this.storages.get(batch.storage_id);
        if (storage) {
            storage.batch_count = this.getBatchesByStorage(batch.storage_id).length;
        }
    }

    removeBatch(batchId) {
        const batch = this.batches.get(batchId);
        if (batch) {
            this.batches.delete(batchId);
            // Update batch count
            const storage = this.storages.get(batch.storage_id);
            if (storage) {
                storage.batch_count = this.getBatchesByStorage(batch.storage_id).length;
            }
            return batch;
        }
        return null;
    }

    getBatch(batchId) {
        return this.batches.get(batchId) || null;
    }

    getBatchesByStorage(storageId) {
        return Array.from(this.batches.values()).filter(b => b.storage_id === storageId);
    }

    // ===================== TELEMETRY METHODS =====================

    addTelemetryReading(storageId, reading) {
        if (!this.telemetryHistory.has(storageId)) {
            this.telemetryHistory.set(storageId, []);
        }

        this.telemetryHistory.get(storageId).push(reading);

        // Limit: simpan maksimal 1000 reading per storage
        const history = this.telemetryHistory.get(storageId);
        if (history.length > 1000) {
            this.telemetryHistory.set(storageId, history.slice(-1000));
        }
    }

    getTelemetryHistory(storageId, startTime, endTime, limit) {
        const history = this.telemetryHistory.get(storageId) || [];

        let filtered = history;
        if (startTime) {
            filtered = filtered.filter(r => r.timestamp >= startTime);
        }
        if (endTime) {
            filtered = filtered.filter(r => r.timestamp <= endTime);
        }
        if (limit && limit > 0) {
            filtered = filtered.slice(-limit);
        }

        return filtered;
    }

    // ===================== ALERT METHODS =====================

    addAlert(alert) {
        alert.alert_id = alert.alert_id || uuidv4();
        alert.triggered_at = alert.triggered_at || Date.now();
        alert.resolved = false;
        alert.resolved_at = 0;
        alert.resolved_by = '';

        this.alerts.push(alert);

        // Notify watchers
        this._notifyAlertWatchers(alert, 'NEW_ALERT');

        return alert;
    }

    getAlerts(storageId, severity, resolvedOnly) {
        let filtered = [...this.alerts];

        if (storageId && storageId !== '') {
            filtered = filtered.filter(a => a.storage_id === storageId);
        }
        if (severity !== undefined && severity !== null && severity > 0) {
            filtered = filtered.filter(a => a.severity >= severity);
        }
        if (resolvedOnly) {
            filtered = filtered.filter(a => a.resolved === true);
        }

        return filtered;
    }

    resolveAlert(alertId, resolvedBy, notes) {
        const alert = this.alerts.find(a => a.alert_id === alertId);
        if (alert) {
            alert.resolved = true;
            alert.resolved_at = Date.now();
            alert.resolved_by = resolvedBy;
            alert.resolution_notes = notes;

            // Notify watchers
            this._notifyAlertWatchers(alert, 'ALERT_RESOLVED');

            return alert;
        }
        return null;
    }

    // ===================== WATCHER METHODS =====================

    addAlertWatcher(watcherId, call, minSeverity) {
        this.alertWatchers.set(watcherId, { call, minSeverity });
    }

    removeAlertWatcher(watcherId) {
        this.alertWatchers.delete(watcherId);
    }

    _notifyAlertWatchers(alert, notificationType) {
        // Severity mapping: INFO=0, WARNING=1, CRITICAL=2
        for (const [watcherId, watcher] of this.alertWatchers.entries()) {
            try {
                if (alert.severity >= watcher.minSeverity) {
                    watcher.call.write({
                        alert: alert,
                        notification_type: notificationType
                    });
                }
            } catch (err) {
                console.error(`[InMemoryStore] Error notifying watcher ${watcherId}:`, err.message);
                this.alertWatchers.delete(watcherId);
            }
        }
    }
}

// Singleton instance
const store = new InMemoryStore();
module.exports = store;