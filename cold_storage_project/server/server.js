/**
 * ============================================================
 *  🏥 CryoMedics - Smart Cold Storage gRPC Server
 * ============================================================
 *  Entry point server yang menjalankan 4 gRPC services:
 *  1. StorageService    - Manajemen stok & inventaris
 *  2. MonitoringService - Monitoring suhu real-time (streaming)
 *  3. AlertService      - Alert & notifikasi (server streaming)
 *  4. ReportService     - Laporan & compliance
 * ============================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const store = require('./state/dbStore');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// ===================== GUI SETUP (BLESSED) =====================

const screen = blessed.screen({ smartCSR: true, title: 'CryoMedics Server Dashboard' });
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Log Kiri (Lebar 9 Kolom)
const logBox = grid.set(0, 0, 12, 9, contrib.log, {
    fg: "green",
    selectedFg: "green",
    label: ' Server Running Data Logs '
});

// Status Kanan Atas (Lebar 3 Kolom)
const statusBox = grid.set(0, 9, 6, 3, blessed.box, {
    label: ' System Status ',
    content: '\n Booting PostgreSQL...',
    style: { fg: 'cyan', border: { fg: 'cyan' } }
});

// Gauge Kanan Bawah (Lebar 3 Kolom)
const usersGauge = grid.set(6, 9, 6, 3, contrib.gauge, {
    label: ' Active Watchers load ',
    stroke: 'yellow',
    fill: 'white'
});

// Override standard console.log agar tercetak ke TUI, bukan merusak layar
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
    const msg = args.join(' ');
    logBox.log(msg);
    screen.render();
};

console.error = function(...args) {
    const msg = args.join(' ');
    logBox.log(`[ERROR] ${msg}`);
    screen.render();
};

// Key bindings for quit
screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
});

// ===================== LOAD PROTO =====================

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'medicold.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: Number, enums: Number, defaults: true, oneofs: true
});

const medicoldProto = grpc.loadPackageDefinition(packageDefinition).medicold;

// ===================== IMPORT SERVICE HANDLERS =====================

const storageServiceHandlers = require('./services/storageService');
const monitoringServiceHandlers = require('./services/monitoringService');
const alertServiceHandlers = require('./services/alertService');
const reportServiceHandlers = require('./services/reportService');

// ===================== START SERVER =====================

async function startServer() {
    screen.render();
    
    try {
        console.log('[SYS] Initializing PostgreSQL Database...');
        await store.init();
        console.log('[SYS] PostgreSQL Database Initialized.');
    } catch (err) {
        console.error('[ERR] Failed to initialize Database:', err);
        process.exit(1);
    }

    const server = new grpc.Server();

    // Register semua services
    server.addService(medicoldProto.StorageService.service, storageServiceHandlers);
    server.addService(medicoldProto.MonitoringService.service, monitoringServiceHandlers);
    server.addService(medicoldProto.AlertService.service, alertServiceHandlers);
    server.addService(medicoldProto.ReportService.service, reportServiceHandlers);

    const portNum = process.env.PORT || 50051;
    const PORT = `0.0.0.0:${portNum}`;

    server.bindAsync(PORT, grpc.ServerCredentials.createInsecure(), (error, port) => {
        if (error) {
            console.error('[ERR] Failed to start server:', error);
            return;
        }

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║   CryoMedics - Smart Cold Storage Server (Main API)      ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log(`[System] Server running on port ${port}`);
        console.log('[System] Connected to Database and ready to serve.');
        console.log('[System] Waiting for client connections...');
        console.log('');
        
        statusBox.setContent(`\n Port: ${port}\n DB: Connected\n Status: ONLINE\n Users: 0`);
        screen.render();
        
        // Polling GUI untuk Active Users
        setInterval(() => {
            const count = store.getAlertWatchersCount();
            
            // Asumsi 10 klien adalah 100% beban koneksi gauge ini
            const cap = 10; 
            let pct = Math.round((count / cap) * 100);
            if (pct > 100) pct = 100;
            
            // Render warna sesuai beban
            if(pct >= 80) usersGauge.options.stroke = 'red';
            else if(pct >= 50) usersGauge.options.stroke = 'yellow';
            else usersGauge.options.stroke = 'green';
            
            usersGauge.setPercent(pct);
            
            statusBox.setContent(`\n Port: ${port}\n DB: Connected\n Status: ONLINE\n Watchers: ${count}`);
            screen.render();
        }, 1000);
    });
}

startServer();
