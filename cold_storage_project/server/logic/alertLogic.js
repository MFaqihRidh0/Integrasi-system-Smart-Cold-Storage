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

const store = require('../state/dbStore');
const { v4: uuidv4 } = require('uuid');

const alertLogic = {

    /**
     * Cek apakah suhu terdeteksi anomali berdasarkan requirement batch
     */
    async checkTemperatureAnomaly(storageId, temperature, batch) {
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
            triggered_at: Date.now()
        };

        const createdAlert = await store.addAlert(alert);

        const severityLabel = ['INFO', 'WARNING', 'CRITICAL'][severity];
        console.log(`[AlertLogic] 🚨 ${severityLabel} Alert → Storage '${storageId}' | Temp: ${temperature}°C | Threshold: ${threshold}°C`);

        return createdAlert;
    },

    /**
     * Cek anomali suhu standar (saat kulkas kosong / tanpa batch spesifik)
     */
    async checkGlobalTemperatureAnomaly(storageId, temperature) {
        let severity = 0; // INFO
        let threshold = 0;

        if (temperature > 8 || temperature < -80) {
            severity = 2; // CRITICAL
            threshold = temperature > 8 ? 8 : -80;
        } else if (temperature > 5 || temperature < -75) {
            severity = 1; // WARNING
            threshold = temperature > 5 ? 5 : -75;
        } else {
            return null; // Dalam range normal
        }

        const alert = {
            alert_id: uuidv4(),
            storage_id: storageId,
            type: 0, // TEMP_OUT_OF_RANGE
            severity: severity,
            message: `Suhu ${temperature}°C di luar batas standar sistem [-75°C ~ 5°C] (Kulkas kosong)`,
            value: temperature,
            threshold: threshold,
            triggered_at: Date.now()
        };

        const createdAlert = await store.addAlert(alert);

        const severityLabel = ['INFO', 'WARNING', 'CRITICAL'][severity];
        console.log(`[AlertLogic] 🚨 ${severityLabel} Global Alert → Storage '${storageId}' | Temp: ${temperature}°C | Threshold: ${threshold}°C`);

        return createdAlert;
    },

    /**
     * Cek apakah kelembaban terlalu tinggi
     */
    async checkHumidityAnomaly(storageId, humidity) {
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
            triggered_at: Date.now()
        };

        const createdAlert = await store.addAlert(alert);

        const severityLabel = ['INFO', 'WARNING', 'CRITICAL'][severity];
        console.log(`[AlertLogic] 💧 ${severityLabel} Humidity Alert → Storage '${storageId}' | Humidity: ${humidity}%`);

        return createdAlert;
    },

    /**
     * Mengambil daftar alert berdasarkan filter
     */
    async getAlerts(storageId, severity, resolvedOnly) {
        const alerts = await store.getAlerts(storageId, severity, resolvedOnly);
        return { alerts };
    },

    /**
     * Menyelesaikan (resolve) alert tertentu
     */
    async resolveAlert(alertId, resolvedBy, notes) {
        if (!alertId) throw new Error("Alert ID is required");

        const resolved = await store.resolveAlert(alertId, resolvedBy, notes);

        if (!resolved) {
            return {
                success: false,
                message: `Alert '${alertId}' tidak ditemukan atau sudah di-resolve`
            };
        }

        console.log(`[AlertLogic] ✅ Alert '${alertId}' resolved by '${resolvedBy}' | Notes: ${notes}`);

        return {
            success: true,
            message: `Alert '${alertId}' berhasil diubah statusnya (Resolved) oleh '${resolvedBy}'`
        };
    }
};

module.exports = alertLogic;
