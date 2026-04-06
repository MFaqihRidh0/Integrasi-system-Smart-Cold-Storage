const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, 'proto', 'medicold.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: Number, enums: Number, defaults: true, oneofs: true
});
const medicoldProto = grpc.loadPackageDefinition(packageDefinition).medicold;

const SERVER_ADDRESS = 'localhost:50051';
const storageClient = new medicoldProto.StorageService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const reportClient = new medicoldProto.ReportService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const alertClient = new medicoldProto.AlertService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const monitoringClient = new medicoldProto.MonitoringService(SERVER_ADDRESS, grpc.credentials.createInsecure());

async function runTests() {
    console.log("🚀 Menjalankan Integration Test Penuh...");
    
    // 1. StorageService: RegisterStock
    await new Promise((resolve) => {
        storageClient.RegisterStock({
            batch_id: 'BATCH-TEST-001', storage_id: 'FRIDGE-001', content_type: 'Test Vaccine',
            quantity: 50, expiry_date: '2026-12-31', notes: 'Automated test',
            min_temp: -25.0, max_temp: -15.0
        }, (err, res) => {
            console.log("1. RegisterStock:", err ? err.message : res.message);
            resolve();
        });
    });

    // 2. StorageService: GetInventory
    await new Promise((resolve) => {
        storageClient.GetInventory({ storage_id: 'FRIDGE-001' }, (err, res) => {
            console.log("2. GetInventory:", err ? err.message : `Terdapat ${res.batches?.length || 0} batches`);
            resolve();
        });
    });

    // 3. AlertService: GetAlerts
    await new Promise((resolve) => {
        alertClient.GetAlerts({ storage_id: 'FRIDGE-001', severity: 0, resolved_only: false }, (err, res) => {
             console.log("3. GetAlerts:", err ? err.message : `Ditemukan ${res.alerts?.length || 0} alerts aktif`);
             resolve();
        });
    });

    // 4. ReportService: GenerateDailyReport
    await new Promise((resolve) => {
        reportClient.GenerateDailyReport({ date: new Date().toISOString().split('T')[0], storage_id: '' }, (err, res) => {
            console.log("4. GenerateDailyReport:", err ? err.message : `Sukses! System Uptime: ${res.system_uptime_percentage}%`);
            resolve();
        });
    });

    // 5. ReportService: ExportCSV
    await new Promise((resolve) => {
        reportClient.ExportCSV({ storage_id: 'FRIDGE-001', start_time: 0, end_time: Date.now(), format: 'CSV' }, (err, res) => {
            console.log("5. ExportCSV:", err ? err.message : `URL: ${res.download_url} (Records: ${res.record_count})`);
            resolve();
        });
    });

    // 6. MonitoringService: GetAllStorageStatus
    await new Promise((resolve) => {
        monitoringClient.GetAllStorageStatus({}, (err, res) => {
             console.log("6. GetAllStorageStatus:", err ? err.message : `Total Storages: ${res.storages?.length || 0}`);
             resolve();
        });
    });

    console.log("✅ Semua pengujian selesai.");
}

runTests();
