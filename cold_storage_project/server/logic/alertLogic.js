/**
 * ============================================================
 *  CryoMedics - Alert Logic (Business Logic)
 * ============================================================
 *  Menangani logika bisnis untuk manajemen alert:
 *  - checkTemperatureAnomaly: deteksi suhu di luar batas
 *  - checkHumidityAnomaly: deteksi kelembaban tinggi
 *  - getAlerts: filter daftar alert
 *  - resolveAlert: resolve alert tertentu
 * ============================================================
 */

const store = require('../state/inMemoryStore');
const { v4: uuidv4 } = require('uuid');

const alertLogic = {

    /**
     * Cek apakah suhu terdeteksi anomali berdasarkan requirement batch
     * @param {string} storageId - ID storage
     * @param {number} temperature - Suhu yang terukur
     * @param {Object} batch - Batch dengan min_temp & max_temp
     * @returns {Object|null} Alert object atau null
     */
    checkTemperatureAnomaly(storageId, temperature, batch) {
        let severity = 0; // INFO
        let threshold = 0;

        if (temperature > batch.max_temp + 5 || temperature < batch.min_temp - 5) {
            severity = 2; // CRITICAL
            threshold = temperature > batch.max_temp ? batch.max_temp : batch.min_temp;
        } else if (temperature > batch.max_temp || temperature < batch.min_temp) {
            severity = 1; // WARNING
            threshold = temperature > batch.max_temp ? batch.max_temp : batch.min_temp;
        } else {
            return null; // Dalam range normal
        }

        const alert = {
            alert_id: uuidv4(),
            storage_id: storageId,
            type: 0, // TEMP_OUT_OF_RANGE
            severity: severity,
            message: `Suhu ${temperature}°C di luar batas yang diizinkan [${batch.min_temp}°C ~ ${batch.max_temp}°C] untuk batch '${batch.batch_id}' (${batch.content_type})`,
            value: temperature,
            threshold: threshold,
            triggered_at: Date.now(),
            resolved: false,
            resolved_at: 0,
            resolved_by: ''
        };

        store.addAlert(alert);

        const severityLabel = ['INFO', 'WARNING', 'CRITICAL'][severity];
        console.log(`[AlertLogic] 🚨 ${severityLabel} Alert → Storage '${storageId}' | Temp: ${temperature}°C | Threshold: ${threshold}°C`);

        return alert;
    },

    /**
     * Cek apakah kelembaban terlalu tinggi
     * @param {string} storageId - ID storage
     * @param {number} humidity - Kelembaban yang terukur
     * @returns {Object|null} Alert object atau null
     */
    checkHumidityAnomaly(storageId, humidity) {
        if (humidity <= 80) return null;

        const severity = humidity > 90 ? 2 : 1; // CRITICAL if > 90%, WARNING if > 80%
        const threshold = humidity > 90 ? 90 : 80;

        const alert = {
            alert_id: uuidv4(),
            storage_id: storageId,
            type: 1, // HUMIDITY_HIGH
            severity: severity,
            message: `Kelembaban ${humidity}% melebihi batas aman (${threshold}%) di storage '${storageId}'`,
            value: humidity,
            threshold: threshold,
            triggered_at: Date.now(),
            resolved: false,
            resolved_at: 0,
            resolved_by: ''
        };

        store.addAlert(alert);

        const severityLabel = ['INFO', 'WARNING', 'CRITICAL'][severity];
        console.log(`[AlertLogic] 💧 ${severityLabel} Humidity Alert → Storage '${storageId}' | Humidity: ${humidity}%`);

        return alert;
    },

    /**
     * Mengambil daftar alert berdasarkan filter
     * @param {string} storageId - Filter by storage (kosong = semua)
     * @param {number} severity - Filter minimum severity
     * @param {boolean} resolvedOnly - Hanya tampilkan yang sudah resolved
     * @returns {Object} AlertList { alerts }
     */
    getAlerts(storageId, severity, resolvedOnly) {
        const alerts = store.getAlerts(storageId, severity, resolvedOnly);
        return { alerts };
    },

    /**
     * Menyelesaikan (resolve) alert tertentu
     * @param {string} alertId - ID alert yang akan di-resolve
     * @param {string} resolvedBy - Nama orang yang resolve
     * @param {string} notes - Catatan resolusi
     * @returns {Object} { success, message }
     */
    resolveAlert(alertId, resolvedBy, notes) {
        const resolved = store.resolveAlert(alertId, resolvedBy, notes);

        if (!resolved) {
            return {
                success: false,
                message: `Alert '${alertId}' tidak ditemukan`
            };
        }

        console.log(`[AlertLogic] ✅ Alert '${alertId}' resolved by '${resolvedBy}' | Notes: ${notes}`);

        return {
            success: true,
            message: `Alert '${alertId}' berhasil di-resolve oleh '${resolvedBy}'`
        };
    }
};

module.exports = alertLogic;
