/**
 * ============================================================
 *  💻 CryoMedics - Admin Client (Laptop)
 * ============================================================
 *  Client untuk admin yang mengelola inventaris, resolve alert,
 *  dan generate laporan via CLI.
 *
 *  Fitur:
 *  1. Register stok baru ke kulkas
 *  2. Lihat inventaris kulkas
 *  3. Hapus batch dari kulkas
 *  4. Lihat semua alert
 *  5. Resolve alert
 *  6. Generate daily report
 *  7. Export data CSV
 *  8. Cek compliance status
 * ============================================================
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const readline = require('readline');

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

const storageClient = new medicoldProto.StorageService(
    SERVER_ADDRESS, grpc.credentials.createInsecure()
);
const monitoringClient = new medicoldProto.MonitoringService(
    SERVER_ADDRESS, grpc.credentials.createInsecure()
);
const alertClient = new medicoldProto.AlertService(
    SERVER_ADDRESS, grpc.credentials.createInsecure()
);
const reportClient = new medicoldProto.ReportService(
    SERVER_ADDRESS, grpc.credentials.createInsecure()
);

// ===================== READLINE INTERFACE =====================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// ===================== ADMIN FUNCTIONS =====================

/**
 * 1. Register stok baru
 */
async function registerStock() {
    console.log('\n--- 📦 Register Stock Baru ---');

    const batch_id = await ask('Batch ID: ');
    const storage_id = await ask('Storage ID (e.g. FRIDGE-001): ');
    const content_type = await ask('Jenis obat/vaksin: ');
    const quantity = parseInt(await ask('Quantity: '));
    const expiry_date = await ask('Expiry date (YYYY-MM-DD): ');
    const notes = await ask('Catatan: ');
    const min_temp = parseFloat(await ask('Min temperature (°C): '));
    const max_temp = parseFloat(await ask('Max temperature (°C): '));

    storageClient.RegisterStock({
        batch_id, storage_id, content_type, quantity,
        expiry_date, notes, min_temp, max_temp
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            console.log(`\n${response.success ? '✅' : '❌'} ${response.message}`);
        }
        showMenu();
    });
}

/**
 * 2. Lihat inventaris
 */
async function getInventory() {
    console.log('\n--- 📋 Lihat Inventaris ---');

    const storage_id = await ask('Storage ID (e.g. FRIDGE-001): ');

    storageClient.GetInventory({ storage_id }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            console.log(`\n📋 Inventaris Storage '${response.storage_id}':`);
            console.log(`   Last Updated: ${new Date(response.last_updated).toLocaleString()}`);

            if (response.batches.length === 0) {
                console.log('   (Kosong - tidak ada batch)');
            } else {
                response.batches.forEach((b, i) => {
                    console.log(`\n   [${i + 1}] Batch ID    : ${b.batch_id}`);
                    console.log(`       Content Type : ${b.content_type}`);
                    console.log(`       Quantity     : ${b.quantity}`);
                    console.log(`       Expiry       : ${b.expiry_date}`);
                    console.log(`       Temp Range   : ${b.min_temp}°C ~ ${b.max_temp}°C`);
                    console.log(`       Notes        : ${b.notes}`);
                });
            }
        }
        showMenu();
    });
}

/**
 * 3. Hapus batch
 */
async function removeBatch() {
    console.log('\n--- 🗑️  Hapus Batch ---');

    const batch_id = await ask('Batch ID yang akan dihapus: ');
    const reason = await ask('Alasan penghapusan: ');

    storageClient.RemoveBatch({ batch_id, reason }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            console.log(`\n${response.success ? '✅' : '❌'} ${response.message}`);
        }
        showMenu();
    });
}

/**
 * 4. Lihat semua alert
 */
async function getAlerts() {
    console.log('\n--- 🔔 Daftar Alert ---');

    const storage_id = await ask('Storage ID (kosongkan untuk semua): ');

    alertClient.GetAlerts({
        storage_id: storage_id || '',
        severity: 0,
        resolved_only: false
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            const severityLabels = ['INFO', 'WARNING', 'CRITICAL'];
            const typeLabels = ['TEMP_OUT_OF_RANGE', 'HUMIDITY_HIGH', 'SENSOR_DISCONNECTED', 'DOOR_OPEN_TOO_LONG', 'POWER_FAILURE'];

            console.log(`\n🔔 Total Alerts: ${response.alerts.length}`);

            if (response.alerts.length === 0) {
                console.log('   ✅ Tidak ada alert aktif');
            } else {
                response.alerts.forEach((alert, i) => {
                    const icon = alert.severity === 2 ? '🔴' : alert.severity === 1 ? '🟡' : '🔵';
                    console.log(`\n   ${icon} [${i + 1}] Alert ID  : ${alert.alert_id}`);
                    console.log(`       Storage    : ${alert.storage_id}`);
                    console.log(`       Type       : ${typeLabels[alert.type] || alert.type}`);
                    console.log(`       Severity   : ${severityLabels[alert.severity] || alert.severity}`);
                    console.log(`       Message    : ${alert.message}`);
                    console.log(`       Value      : ${alert.value} | Threshold: ${alert.threshold}`);
                    console.log(`       Triggered  : ${new Date(alert.triggered_at).toLocaleString()}`);
                    console.log(`       Resolved   : ${alert.resolved ? `✅ by ${alert.resolved_by}` : '❌ Belum'}`);
                });
            }
        }
        showMenu();
    });
}

/**
 * 5. Resolve alert
 */
async function resolveAlert() {
    console.log('\n--- ✅ Resolve Alert ---');

    const alert_id = await ask('Alert ID: ');
    const resolved_by = await ask('Resolved by (nama): ');
    const resolution_notes = await ask('Catatan resolusi: ');

    alertClient.ResolveAlert({
        alert_id, resolved_by, resolution_notes
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            console.log(`\n${response.success ? '✅' : '❌'} ${response.message}`);
        }
        showMenu();
    });
}

/**
 * 6. Generate daily report
 */
async function generateDailyReport() {
    console.log('\n--- 📊 Generate Daily Report ---');

    const date = await ask('Tanggal (YYYY-MM-DD, kosongkan untuk hari ini): ');
    const storage_id = await ask('Storage ID (kosongkan untuk semua): ');

    reportClient.GenerateDailyReport({
        date: date || new Date().toISOString().split('T')[0],
        storage_id: storage_id || ''
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            console.log(`\n📊 DAILY REPORT - ${response.report_date}`);
            console.log(`   Generated at: ${response.generated_at}`);
            console.log(`   Total Alerts: ${response.total_alerts} | Critical: ${response.critical_alerts}`);
            console.log(`   System Uptime: ${response.system_uptime_percentage}%`);

            response.storage_summaries.forEach(s => {
                console.log(`\n   📦 Storage: ${s.storage_id}`);
                console.log(`      Avg Temp     : ${s.avg_temp}°C`);
                console.log(`      Temp Range   : ${s.min_temp}°C ~ ${s.max_temp}°C`);
                console.log(`      Readings     : ${s.total_readings}`);
                console.log(`      Alerts       : ${s.alert_count}`);
                console.log(`      Uptime       : ${s.uptime_percentage}%`);
                console.log(`      Compliance   : ${s.within_compliance ? '✅ OK' : '⚠️ VIOLATION'}`);
            });
        }
        showMenu();
    });
}

/**
 * 7. Export CSV
 */
async function exportCSV() {
    console.log('\n--- 📁 Export Data ---');

    const storage_id = await ask('Storage ID: ');
    const format = await ask('Format (CSV/JSON): ');

    reportClient.ExportCSV({
        storage_id,
        start_time: 0,
        end_time: Date.now(),
        format: format || 'CSV'
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            if (response.success) {
                console.log(`\n✅ Export berhasil!`);
                console.log(`   Download URL : ${response.download_url}`);
                console.log(`   File Size    : ${response.file_size_bytes} bytes`);
                console.log(`   Record Count : ${response.record_count}`);
            } else {
                console.log('\n❌ Tidak ada data untuk di-export');
            }
        }
        showMenu();
    });
}

/**
 * 8. Compliance status
 */
async function getComplianceStatus() {
    console.log('\n--- 📋 Compliance Status ---');

    const period_start = await ask('Periode mulai (YYYY-MM-DD): ');
    const period_end = await ask('Periode akhir (YYYY-MM-DD): ');

    reportClient.GetComplianceStatus({
        period_start: period_start || '',
        period_end: period_end || ''
    }, (error, response) => {
        if (error) {
            console.error('❌ Error:', error.message);
        } else {
            console.log(`\n📋 COMPLIANCE REPORT`);
            console.log(`   Overall: ${response.overall_compliant ? '✅ COMPLIANT' : '⚠️ NON-COMPLIANT'}`);
            console.log(`   Average Compliance Rate: ${response.average_compliance_rate}%`);

            response.storage_compliance.forEach(s => {
                const icon = s.compliant ? '✅' : '⚠️';
                console.log(`\n   ${icon} Storage: ${s.storage_id}`);
                console.log(`      Compliance : ${s.compliance_percentage}%`);
                console.log(`      Violations : ${s.violations_count}`);
            });

            console.log('\n   📌 Recommendations:');
            response.recommendations.forEach((r, i) => {
                console.log(`      ${i + 1}. ${r}`);
            });
        }
        showMenu();
    });
}

// ===================== MENU =====================

function showMenu() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   💻 CryoMedics Admin Panel                             ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║                                                          ║');
    console.log('║   📦 Storage                                             ║');
    console.log('║     1. Register stok baru                                ║');
    console.log('║     2. Lihat inventaris                                  ║');
    console.log('║     3. Hapus batch                                       ║');
    console.log('║                                                          ║');
    console.log('║   🔔 Alert                                               ║');
    console.log('║     4. Lihat semua alert                                 ║');
    console.log('║     5. Resolve alert                                     ║');
    console.log('║                                                          ║');
    console.log('║   📊 Report                                              ║');
    console.log('║     6. Generate daily report                             ║');
    console.log('║     7. Export data (CSV/JSON)                            ║');
    console.log('║     8. Cek compliance status                             ║');
    console.log('║                                                          ║');
    console.log('║     0. Exit                                              ║');
    console.log('║                                                          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    rl.question('\n Pilih menu [0-8]: ', async (choice) => {
        switch (choice.trim()) {
            case '1': await registerStock(); break;
            case '2': await getInventory(); break;
            case '3': await removeBatch(); break;
            case '4': await getAlerts(); break;
            case '5': await resolveAlert(); break;
            case '6': await generateDailyReport(); break;
            case '7': await exportCSV(); break;
            case '8': await getComplianceStatus(); break;
            case '0':
                console.log('\n👋 Terima kasih telah menggunakan CryoMedics Admin Panel!\n');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('\n⚠️ Pilihan tidak valid. Silakan pilih 0-8.');
                showMenu();
        }
    });
}

// ===================== RUN =====================

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║                                                          ║');
console.log('║   💻 CryoMedics - Admin Client                          ║');
console.log('║   Connecting to server...                                ║');
console.log('║                                                          ║');
console.log('╚══════════════════════════════════════════════════════════╝');

showMenu();
