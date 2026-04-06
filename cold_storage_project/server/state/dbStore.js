const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const EventEmitter = require('events');

class DbStore extends EventEmitter {
    constructor() {
        super();
        this.alertWatchers = new Map();
    }

    async init() {
        await db.initDB();
    }

    // ===================== STORAGE METHODS =====================

    async getStorage(storageId) {
        const { rows } = await db.query('SELECT * FROM storages WHERE storage_id = $1', [storageId]);
        return rows[0] || null;
    }

    async getAllStorages() {
        const { rows } = await db.query('SELECT * FROM storages');
        return rows;
    }

    async updateStorageStatus(storageId, temp, humidity, status) {
        await db.query(`
            UPDATE storages 
            SET current_temp = $1, current_humidity = $2, status = $3, last_update = EXTRACT(EPOCH FROM NOW()) * 1000
            WHERE storage_id = $4
        `, [temp, humidity, status, storageId]);
    }

    // ===================== BATCH METHODS =====================

    async addBatch(batch) {
        await db.query(`
            INSERT INTO batches (batch_id, storage_id, content_type, quantity, expiry_date, notes, min_temp, max_temp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [batch.batch_id, batch.storage_id, batch.content_type, batch.quantity, batch.expiry_date, batch.notes, batch.min_temp, batch.max_temp]);
        
        // Update batch count in storage
        await this._updateBatchCount(batch.storage_id);
    }

    async removeBatch(batchId) {
        const batch = await this.getBatch(batchId);
        if (batch) {
            await db.query('DELETE FROM batches WHERE batch_id = $1', [batchId]);
            await this._updateBatchCount(batch.storage_id);
        }
        return batch;
    }

    async getBatch(batchId) {
        const { rows } = await db.query('SELECT * FROM batches WHERE batch_id = $1', [batchId]);
        return rows[0] || null;
    }

    async getBatchesByStorage(storageId) {
        const { rows } = await db.query('SELECT * FROM batches WHERE storage_id = $1', [storageId]);
        return rows;
    }

    async _updateBatchCount(storageId) {
        const { rows } = await db.query('SELECT COUNT(*) FROM batches WHERE storage_id = $1', [storageId]);
        const count = parseInt(rows[0].count);
        await db.query('UPDATE storages SET batch_count = $1 WHERE storage_id = $2', [count, storageId]);
    }

    // ===================== TELEMETRY METHODS =====================

    async addTelemetryReading(storageId, reading) {
        const timestamp = reading.timestamp || Date.now();
        await db.query(`
            INSERT INTO telemetry (storage_id, timestamp, temperature, humidity, pressure, sensor_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [storageId, timestamp, reading.temperature, reading.humidity, reading.pressure, reading.sensor_id]);
    }

    async getTelemetryHistory(storageId, startTime, endTime, limit) {
        let query = 'SELECT * FROM telemetry WHERE storage_id = $1';
        let params = [storageId];
        let paramIndex = 2;

        if (startTime) {
            query += ` AND timestamp >= $${paramIndex}`;
            params.push(startTime);
            paramIndex++;
        }
        if (endTime) {
            query += ` AND timestamp <= $${paramIndex}`;
            params.push(endTime);
            paramIndex++;
        }

        query += ` ORDER BY timestamp DESC`;
        
        if (limit && limit > 0) {
            query += ` LIMIT $${paramIndex}`;
            params.push(limit);
        }

        const { rows } = await db.query(query, params);
        // Reverse rows to return chronologically
        return rows.reverse();
    }

    // ===================== ALERT METHODS =====================

    async addAlert(alert) {
        alert.alert_id = alert.alert_id || uuidv4();
        alert.triggered_at = alert.triggered_at || Date.now();
        
        await db.query(`
            INSERT INTO alerts (alert_id, storage_id, type, severity, message, value, threshold, triggered_at, resolved, resolved_at, resolved_by, resolution_notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 0, '', '')
        `, [
            alert.alert_id, alert.storage_id, alert.type, alert.severity, 
            alert.message, alert.value, alert.threshold, alert.triggered_at
        ]);

        this._notifyAlertWatchers(alert, 'NEW_ALERT');
        return alert;
    }

    async getAlerts(storageId, severity, resolvedOnly) {
        let query = 'SELECT * FROM alerts WHERE 1=1';
        let params = [];
        let paramIndex = 1;

        if (storageId && storageId !== '') {
            query += ` AND storage_id = $${paramIndex}`;
            params.push(storageId);
            paramIndex++;
        }
        if (severity !== undefined && severity !== null && severity > 0) {
            query += ` AND severity >= $${paramIndex}`;
            params.push(severity);
            paramIndex++;
        }
        if (resolvedOnly) {
            query += ` AND resolved = TRUE`;
        }

        query += ' ORDER BY triggered_at DESC';

        const { rows } = await db.query(query, params);
        return rows;
    }

    async resolveAlert(alertId, resolvedBy, notes) {
        const { rows } = await db.query('SELECT * FROM alerts WHERE alert_id = $1 AND resolved = FALSE', [alertId]);
        if (rows.length === 0) return null; // Already resolved or not found

        const resolvedAt = Date.now();
        await db.query(`
            UPDATE alerts 
            SET resolved = TRUE, resolved_at = $1, resolved_by = $2, resolution_notes = $3
            WHERE alert_id = $4
        `, [resolvedAt, resolvedBy, notes, alertId]);

        const updatedAlertRows = await db.query('SELECT * FROM alerts WHERE alert_id = $1', [alertId]);
        const updatedAlert = updatedAlertRows.rows[0];

        this._notifyAlertWatchers(updatedAlert, 'ALERT_RESOLVED');
        return updatedAlert;
    }

    // ===================== WATCHER METHODS =====================

    addAlertWatcher(watcherId, call, minSeverity) {
        this.alertWatchers.set(watcherId, { call, minSeverity });
    }

    removeAlertWatcher(watcherId) {
        this.alertWatchers.delete(watcherId);
    }

    getAlertWatchersCount() {
        return this.alertWatchers.size;
    }

    _notifyAlertWatchers(alert, notificationType) {
        for (const [watcherId, watcher] of this.alertWatchers.entries()) {
            try {
                if (alert.severity >= watcher.minSeverity) {
                    watcher.call.write({
                        alert: alert,
                        notification_type: notificationType
                    });
                }
            } catch (err) {
                console.error(`[DbStore] Error notifying watcher ${watcherId}:`, err.message);
                this.alertWatchers.delete(watcherId);
            }
        }
    }
}

const store = new DbStore();
module.exports = store;
