/**
 * ============================================================
 *  🏥 CryoMedics - Smart Cold Storage gRPC Server
 * ============================================================
 *  Entry point server yang menjalankan 4 gRPC services:
 *  1. StorageService    - Manajemen stok & inventaris
 *  2. MonitoringService - Monitoring suhu real-time (streaming)
 *  3. AlertService      - Alert & notifikasi (server streaming)
 *  4. ReportService     - Laporan & compliance
 *
 *  Port: 50051
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

// ===================== IMPORT SERVICE HANDLERS =====================

const storageServiceHandlers = require('./services/storageService');
const monitoringServiceHandlers = require('./services/monitoringService');
const alertServiceHandlers = require('./services/alertService');
const reportServiceHandlers = require('./services/reportService');

// ===================== START SERVER =====================

function startServer() {
    const server = new grpc.Server();

    // Register semua services
    server.addService(medicoldProto.StorageService.service, storageServiceHandlers);
    server.addService(medicoldProto.MonitoringService.service, monitoringServiceHandlers);
    server.addService(medicoldProto.AlertService.service, alertServiceHandlers);
    server.addService(medicoldProto.ReportService.service, reportServiceHandlers);

    const PORT = '0.0.0.0:50051';

    server.bindAsync(PORT, grpc.ServerCredentials.createInsecure(), (error, port) => {
        if (error) {
            console.error('❌ Failed to start server:', error);
            return;
        }

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║                                                          ║');
        console.log('║   🏥 CryoMedics - Smart Cold Storage Server              ║');
        console.log('║                                                          ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║   🌐 Server running on port ${port}                     ║`);
        console.log('║                                                          ║');
        console.log('║   📦 Services:                                           ║');
        console.log('║     ├─ StorageService    (Inventory Management)          ║');
        console.log('║     ├─ MonitoringService (Real-time Telemetry)           ║');
        console.log('║     ├─ AlertService      (Alert & Notifications)         ║');
        console.log('║     └─ ReportService     (Reports & Compliance)          ║');
        console.log('║                                                          ║');
        console.log('║   🧊 Default Storages:                                   ║');
        console.log('║     ├─ FRIDGE-001 (Freezer -20°C)                        ║');
        console.log('║     ├─ FRIDGE-002 (Refrigerator 4°C)                     ║');
        console.log('║     └─ FRIDGE-003 (Ultra-cold -70°C)                     ║');
        console.log('║                                                          ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('Waiting for client connections...');
        console.log('');
    });
}

startServer();
