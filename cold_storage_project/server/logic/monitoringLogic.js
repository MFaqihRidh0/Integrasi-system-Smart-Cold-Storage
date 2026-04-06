/**
 * ============================================================
 *  CryoMedics - Monitoring Logic (Business Logic)
 * ============================================================
 *  Menangani logika bisnis untuk monitoring suhu real-time:
 *  - processTelemetryStream: proses client-side streaming data sensor
 *  - getAllStorageStatus: ambil status semua kulkas
 *  - getStorageHistory: ambil riwayat telemetry
 * ============================================================
 */

const store = require('../state/inMemoryStore');
const alertLogic = require('./alertLogic');

const monitoringLogic = {

    /**
     * Memproses satu reading telemetry dari sensor
     * Melakukan update status storage dan pengecekan anomali
     * @param {Object} reading - TelemetryReading dari sensor
     * @returns {Object|null} Alert jika terdeteksi anomali
     */
    processTelemetryReading(reading) {
        const { storage_id, temperature, humidity, pressure, timestamp, sensor_id } = reading;

        // Pastikan storage ada
        let storage = store.getStorage(storage_id);
        if (!storage) {
            console.warn(`[MonitoringLogic] ⚠️ Unknown storage_id: ${storage_id}, skipping...`);
            return null;
        }

        // Simpan reading ke history
        store.addTelemetryReading(storage_id, {
            temperature,
            humidity,
            pressure,
            timestamp: timestamp || Date.now(),
            sensor_id
        });

        // Tentukan status berdasarkan batch requirements
        const batches = store.getBatchesByStorage(storage_id);
        let newStatus = 'NORMAL';
        let anomalyAlert = null;

        if (batches.length > 0) {
            // Cek apakah suhu di luar range yang diizinkan oleh batch manapun
            for (const batch of batches) {
                if (temperature < batch.min_temp - 5 || temperature > batch.max_temp + 5) {
                    newStatus = 'CRITICAL';
                    anomalyAlert = alertLogic.checkTemperatureAnomaly(storage_id, temperature, batch);
                    break;
                } else if (temperature < batch.min_temp || temperature > batch.max_temp) {
                    newStatus = 'WARNING';
                    if (!anomalyAlert) {
                        anomalyAlert = alertLogic.checkTemperatureAnomaly(storage_id, temperature, batch);
                    }
                }
            }
        } else {
            // Tanpa batch, gunakan range standar
            if (temperature > 8 || temperature < -80) {
                newStatus = 'CRITICAL';
            } else if (temperature > 5 || temperature < -75) {
                newStatus = 'WARNING';
            }
        }

        // Cek humidity anomaly
        if (humidity > 80) {
            const humidityAlert = alertLogic.checkHumidityAnomaly(storage_id, humidity);
            if (humidityAlert) {
                anomalyAlert = humidityAlert;
            }
            if (newStatus !== 'CRITICAL') {
                newStatus = 'WARNING';
            }
        }

        // Update status storage
        store.updateStorageStatus(storage_id, temperature, humidity, newStatus);

        return anomalyAlert;
    },

    /**
     * Membuat summary dari sesi streaming telemetry
     * @param {string} storageId - ID storage
     * @param {Array} readings - Semua reading dari sesi streaming
     * @param {string} sessionStart - Waktu mulai sesi
     * @param {string} sessionEnd - Waktu akhir sesi
     * @param {number} anomalyCount - Jumlah anomali terdeteksi
     * @returns {Object} TelemetrySummary
     */
    createTelemetrySummary(storageId, readings, sessionStart, sessionEnd, anomalyCount) {
        if (readings.length === 0) {
            return {
                storage_id: storageId,
                total_packets_received: 0,
                avg_temperature: 0,
                min_temperature: 0,
                max_temperature: 0,
                avg_humidity: 0,
                anomaly_count: 0,
                session_start: sessionStart,
                session_end: sessionEnd,
                has_critical_alert: false
            };
        }

        const temps = readings.map(r => r.temperature);
        const humidities = readings.map(r => r.humidity);

        const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
        const minTemp = Math.min(...temps);
        const maxTemp = Math.max(...temps);
        const avgHumidity = humidities.reduce((a, b) => a + b, 0) / humidities.length;

        // Cek apakah ada critical alert
        const hasCritical = store.getAlerts(storageId).some(a =>
            a.severity === 2 && !a.resolved &&
            a.triggered_at >= new Date(sessionStart).getTime()
        );

        return {
            storage_id: storageId,
            total_packets_received: readings.length,
            avg_temperature: Math.round(avgTemp * 100) / 100,
            min_temperature: Math.round(minTemp * 100) / 100,
            max_temperature: Math.round(maxTemp * 100) / 100,
            avg_humidity: Math.round(avgHumidity * 100) / 100,
            anomaly_count: anomalyCount,
            session_start: sessionStart,
            session_end: sessionEnd,
            has_critical_alert: hasCritical
        };
    },

    /**
     * Mengambil status semua storage yang terdaftar
     * @returns {Object} AllStorageStatus
     */
    getAllStorageStatus() {
        const storages = store.getAllStorages().map(s => ({
            storage_id: s.storage_id,
            current_temp: s.current_temp,
            current_humidity: s.current_humidity,
            status: s.status,
            last_update: s.last_update,
            batch_count: s.batch_count
        }));

        return { storages };
    },

    /**
     * Mengambil riwayat telemetry dari storage tertentu
     * @param {string} storageId - ID storage
     * @param {number} startTime - Timestamp awal (epoch ms)
     * @param {number} endTime - Timestamp akhir (epoch ms)
     * @param {number} limit - Jumlah maksimal data
     * @returns {Object} StorageHistory
     */
    getStorageHistory(storageId, startTime, endTime, limit) {
        const readings = store.getTelemetryHistory(storageId, startTime, endTime, limit);

        return {
            storage_id: storageId,
            readings: readings.map(r => ({
                temperature: r.temperature,
                humidity: r.humidity,
                timestamp: r.timestamp
            }))
        };
    }
};

module.exports = monitoringLogic;
