/**
 * ============================================================
 *  📱 CryoMedics - Dashboard Client (Tablet)
 * ============================================================
 *  Client untuk dashboard monitoring di tablet yang menampilkan
 *  status real-time semua kulkas dan menerima alert streaming.
 *
 *  Fitur:
 *  1. Menampilkan status semua storage secara periodik
 *  2. Watch alerts real-time (server-side streaming)
 *  3. Menampilkan history telemetry storage tertentu
 * ============================================================
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// ===================== LOAD PROTO =====================

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'medicold.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: Number,
    enums: Number,
    defaults: true,
    oneofs: true
});

const medicoldProto = grpc.loadPackageDefinition(packageDefinition).medicold;

// ===================== CLIENT SETUP =====================

const SERVER_ADDRESS = 'localhost:50051';

const monitoringClient = new medicoldProto.MonitoringService(
    SERVER_ADDRESS, grpc.credentials.createInsecure()
);
const alertClient = new medicoldProto.AlertService(
    SERVER_ADDRESS, grpc.credentials.createInsecure()
);

// ===================== DASHBOARD FUNCTIONS =====================

/**
 * Menampilkan status semua storage (refresh periodik)
 */
function displayAllStorageStatus() {
    monitoringClient.GetAllStorageStatus({}, (error, response) => {
        if (error) {
            console.error('❌ Error getting storage status:', error.message);
            return;
        }

        console.clear();
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════════════╗');
        console.log('║   📱 CryoMedics Dashboard - Real-time Monitoring                    ║');
        console.log(`║   🕐 ${new Date().toLocaleString()}                                   `);
        console.log('╠══════════════════════════════════════════════════════════════════════╣');

        if (response.storages.length === 0) {
            console.log('║   Tidak ada storage yang terdaftar                                  ║');
        } else {
            response.storages.forEach(storage => {
                // Status icon & color
                let statusIcon = '🟢';
                if (storage.status === 'CRITICAL') statusIcon = '🔴';
                else if (storage.status === 'WARNING') statusIcon = '🟡';
                else if (storage.status === 'OFFLINE') statusIcon = '⚫';

                console.log('║                                                                      ║');
                console.log(`║   ${statusIcon} ${storage.storage_id}                                            `);
                console.log(`║      🌡️  Temperature : ${storage.current_temp.toFixed(2)}°C                      `);
                console.log(`║      💧 Humidity     : ${storage.current_humidity.toFixed(2)}%                    `);
                console.log(`║      📊 Status       : ${storage.status}                                        `);
                console.log(`║      📦 Batches      : ${storage.batch_count}                                    `);
                console.log(`║      🕐 Last Update  : ${new Date(storage.last_update).toLocaleString()}          `);
                console.log('║   ────────────────────────────────────────────────                   ║');
            });
        }

        console.log('║                                                                      ║');
        console.log('╚══════════════════════════════════════════════════════════════════════╝');
    });
}

/**
 * Watch alerts secara real-time (Server-side Streaming)
 */
function watchAlerts() {
    console.log('\n👁️  Starting alert watcher (Server-side Streaming)...\n');

    const stream = alertClient.WatchAlerts({ min_severity: 0 }); // Watch semua severity

    stream.on('data', (notification) => {
        const severityLabels = ['INFO', 'WARNING', 'CRITICAL'];
        const alert = notification.alert;

        if (notification.notification_type === 'CONNECTED') {
            console.log(`✅ ${alert.message}`);
            return;
        }

        const icon = alert.severity === 2 ? '🔴' : alert.severity === 1 ? '🟡' : '🔵';
        const time = new Date(alert.triggered_at).toLocaleString();

        console.log(`\n${icon} [${notification.notification_type}] ${severityLabels[alert.severity]} Alert`);
        console.log(`   Storage  : ${alert.storage_id}`);
        console.log(`   Message  : ${alert.message}`);
        console.log(`   Value    : ${alert.value} | Threshold: ${alert.threshold}`);
        console.log(`   Time     : ${time}`);
    });

    stream.on('end', () => {
        console.log('\n📴 Alert watching stream ended');
    });

    stream.on('error', (error) => {
        if (error.code === 1) { // CANCELLED
            console.log('\n📴 Alert watcher disconnected');
        } else {
            console.error('\n❌ Alert watcher error:', error.message);
        }
    });
}

/**
 * Menampilkan riwayat telemetry storage tertentu
 */
function getStorageHistory(storageId, limit = 10) {
    monitoringClient.GetStorageHistory({
        storage_id: storageId,
        start_time: 0,
        end_time: Date.now(),
        limit: limit
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
            return;
        }

        console.log(`\n📜 History for '${response.storage_id}' (last ${limit} readings):\n`);
        console.log('   ┌───────────────────────────┬──────────────┬──────────────┐');
        console.log('   │ Timestamp                 │ Temperature  │ Humidity     │');
        console.log('   ├───────────────────────────┼──────────────┼──────────────┤');

        response.readings.forEach(r => {
            const time = new Date(r.timestamp).toLocaleString().padEnd(25);
            const temp = `${r.temperature.toFixed(2)}°C`.padEnd(12);
            const hum = `${r.humidity.toFixed(2)}%`.padEnd(12);
            console.log(`   │ ${time} │ ${temp} │ ${hum} │`);
        });

        console.log('   └───────────────────────────┴──────────────┴──────────────┘');
    });
}

// ===================== MAIN =====================

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║                                                          ║');
console.log('║   📱 CryoMedics - Dashboard Client (Tablet)             ║');
console.log('║   Connecting to server...                                ║');
console.log('║                                                          ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

// 1. Tampilkan status awal
displayAllStorageStatus();

// 2. Refresh status setiap 10 detik
const refreshInterval = setInterval(displayAllStorageStatus, 10000);

// 3. Watch alerts real-time
setTimeout(() => {
    watchAlerts();
}, 1000);

// 4. Tampilkan history FRIDGE-001 setelah 3 detik
setTimeout(() => {
    getStorageHistory('FRIDGE-001', 10);
}, 3000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Dashboard client shutting down...');
    clearInterval(refreshInterval);
    process.exit(0);
});

console.log('📡 Dashboard running. Press Ctrl+C to stop.\n');
