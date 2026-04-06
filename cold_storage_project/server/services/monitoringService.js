/**
 * ============================================================
 *  CryoMedics - MonitoringService Handler (gRPC)
 * ============================================================
 *  Handler gRPC untuk MonitoringService:
 *  - StreamTelemetry (Client-side Streaming)
 *  - GetAllStorageStatus (Unary)
 *  - GetStorageHistory (Unary)
 * ============================================================
 */

const monitoringLogic = require('../logic/monitoringLogic');

const monitoringServiceHandlers = {

    /**
     * StreamTelemetry - Menerima stream data sensor dari client
     * RPC Type: Client-side Streaming
     * 
     * Sensor mengirim data suhu secara terus-menerus,
     * server mengumpulkan semua data dan mengembalikan summary
     * saat client selesai streaming.
     */
    StreamTelemetry(call, callback) {
        const readings = [];
        let anomalyCount = 0;
        let storageId = 'unknown';
        const sessionStart = new Date().toISOString();

        console.log(`\n[MonitoringService] 📡 StreamTelemetry session started at ${sessionStart}`);

        // Event: menerima data dari client
        call.on('data', (telemetryReading) => {
            storageId = telemetryReading.storage_id;
            readings.push(telemetryReading);

            // Proses setiap reading - cek anomali
            const alert = monitoringLogic.processTelemetryReading(telemetryReading);
            if (alert) {
                anomalyCount++;
            }

            // Log setiap 5 reading untuk tidak terlalu verbose
            if (readings.length % 5 === 0 || readings.length === 1) {
                console.log(`[MonitoringService] 📊 Storage '${storageId}' | Packet #${readings.length} | Temp: ${telemetryReading.temperature}°C | Humidity: ${telemetryReading.humidity}%`);
            }
        });

        // Event: client selesai streaming
        call.on('end', () => {
            const sessionEnd = new Date().toISOString();

            // Buat summary dari seluruh sesi streaming
            const summary = monitoringLogic.createTelemetrySummary(
                storageId,
                readings,
                sessionStart,
                sessionEnd,
                anomalyCount
            );

            console.log(`[MonitoringService] ✅ StreamTelemetry session ended for '${storageId}'`);
            console.log(`[MonitoringService]    Total packets: ${summary.total_packets_received} | Avg temp: ${summary.avg_temperature}°C | Anomalies: ${summary.anomaly_count}`);

            callback(null, summary);
        });

        // Event: error di stream
        call.on('error', (error) => {
            console.error(`[MonitoringService] ❌ StreamTelemetry error:`, error.message);
        });
    },

    /**
     * GetAllStorageStatus - Mengambil status semua kulkas
     * RPC Type: Unary
     */
    GetAllStorageStatus(call, callback) {
        console.log(`\n[MonitoringService] 📊 GetAllStorageStatus request`);

        try {
            const result = monitoringLogic.getAllStorageStatus();
            console.log(`[MonitoringService] → Returning status for ${result.storages.length} storages`);
            callback(null, result);
        } catch (error) {
            console.error('[MonitoringService] ❌ GetAllStorageStatus error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    },

    /**
     * GetStorageHistory - Mengambil riwayat telemetry
     * RPC Type: Unary
     */
    GetStorageHistory(call, callback) {
        const { storage_id, start_time, end_time, limit } = call.request;

        console.log(`\n[MonitoringService] 📜 GetStorageHistory request → storage: '${storage_id}' | limit: ${limit}`);

        try {
            const result = monitoringLogic.getStorageHistory(storage_id, start_time, end_time, limit);
            console.log(`[MonitoringService] → Returning ${result.readings.length} readings for '${storage_id}'`);
            callback(null, result);
        } catch (error) {
            console.error('[MonitoringService] ❌ GetStorageHistory error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    }
};

module.exports = monitoringServiceHandlers;
