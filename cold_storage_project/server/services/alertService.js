/**
 * ============================================================
 *  CryoMedics - AlertService Handler (gRPC)
 * ============================================================
 *  Handler gRPC untuk AlertService:
 *  - GetAlerts (Unary)
 *  - ResolveAlert (Unary)
 *  - WatchAlerts (Server-side Streaming)
 * ============================================================
 */

const alertLogic = require('../logic/alertLogic');
const store = require('../state/dbStore');
const { v4: uuidv4 } = require('uuid');

const alertServiceHandlers = {

    /**
     * GetAlerts - Mengambil daftar alert berdasarkan filter
     * RPC Type: Unary
     */
    async GetAlerts(call, callback) {
        const { storage_id, severity, resolved_only } = call.request;

        console.log(`\n[AlertService] [ALERT] GetAlerts request → storage: '${storage_id || 'ALL'}' | severity: ${severity} | resolved_only: ${resolved_only}`);

        try {
            const result = await alertLogic.getAlerts(storage_id, severity, resolved_only);
            console.log(`[AlertService] → Returning ${result.alerts.length} alerts`);
            callback(null, result);
        } catch (error) {
            console.error('[AlertService] ❌ GetAlerts error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    },

    /**
     * ResolveAlert - Menyelesaikan alert tertentu
     * RPC Type: Unary
     */
    async ResolveAlert(call, callback) {
        const { alert_id, resolved_by, resolution_notes } = call.request;

        console.log(`\n[AlertService] [OK] ResolveAlert request → alert: '${alert_id}' | by: '${resolved_by}'`);

        try {
            const result = await alertLogic.resolveAlert(alert_id, resolved_by, resolution_notes);
            callback(null, result);
        } catch (error) {
            console.error('[AlertService] ❌ ResolveAlert error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    },

    /**
     * WatchAlerts - Stream notifikasi alert secara real-time
     * RPC Type: Server-side Streaming
     */
    WatchAlerts(call) {
        const { min_severity } = call.request;
        
        let watcherId = uuidv4();
        if (call.metadata) {
            const userIdMeta = call.metadata.get('user-id');
            if (userIdMeta && userIdMeta.length > 0) {
                watcherId = userIdMeta[0];
            }
        }

        const severityLabels = ['INFO', 'WARNING', 'CRITICAL'];
        console.log(`\n[AlertService] [WATCH] WatchAlerts started → Watcher: '${watcherId}' | Min severity: ${severityLabels[min_severity] || 'INFO'}`);

        // Daftarkan watcher ke store
        store.addAlertWatcher(watcherId, call, min_severity);

        // Kirim initial message
        call.write({
            alert: {
                alert_id: 'SYSTEM',
                storage_id: '',
                type: 0,
                severity: 0,
                message: `Connected to CryoMedics Alert System. Watching for ${severityLabels[min_severity] || 'INFO'}+ alerts...`,
                value: 0,
                threshold: 0,
                triggered_at: Date.now(),
                resolved: false,
                resolved_at: 0,
                resolved_by: ''
            },
            notification_type: 'CONNECTED'
        });

        // Cleanup saat client disconnect
        call.on('cancelled', () => {
            console.log(`[AlertService] [DISCONNECT] Watcher '${watcherId}' disconnected`);
            store.removeAlertWatcher(watcherId);
        });

        call.on('error', (error) => {
            if (error.code !== 1) { // Ignore CANCELLED errors
                console.error(`[AlertService] [ERR] WatchAlerts error for '${watcherId}':`, error.message);
            }
            store.removeAlertWatcher(watcherId);
        });
    }
};

module.exports = alertServiceHandlers;
