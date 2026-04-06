/**
 * ============================================================
 *  📱 CryoMedics - Advanced Dashboard Client (Tablet/Monitor)
 * ============================================================
 *  Client untuk monitoring TUI (Text-Based User Interface)
 *  menggunakan library blessed dan blessed-contrib.
 * ============================================================
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

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

// ===================== UI SETUP (BLESSED) =====================

// Buat layar utama
const screen = blessed.screen({
    smartCSR: true,
    title: 'CryoMedics TUI Dashboard'
});

// Setup master grid 12 baris x 12 kolom
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// 1. GRAFIK SUHU (Line Chart) -> Kiri Atas
const lineChart = grid.set(0, 0, 6, 8, contrib.line, {
    style: { line: "cyan", text: "green", baseline: "black" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: ' Live Temperature History (°C) '
});

// 2. TABEL STATUS KULKAS (Table) -> Kiri Bawah
const statusTable = grid.set(6, 0, 6, 8, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    label: ' Storage Status ',
    columnSpacing: 3,
    columnWidth: [14, 10, 10, 12, 14]
});

// 3. GAUGE KEPATUHAN (Donut/Gauge) -> Kanan Atas
const complianceGauge = grid.set(0, 8, 3, 4, contrib.gauge, {
    label: ' System Compliance (%) ',
    stroke: 'green',
    fill: 'white'
});

// 4. LOG ALARM (Log Box) -> Kanan Bawah
const alertLog = grid.set(3, 8, 9, 4, contrib.log, {
    fg: "red",
    selectedFg: "red",
    label: ' Live Alerts Board '
});

// Struktur data grafik suhu
let temperatureData = {
    title: 'FRIDGE-001',
    x: [],
    y: []
};

// ===================== DATA POLLING & STREAMS =====================

function updateStorageTable() {
    monitoringClient.GetAllStorageStatus({}, (error, response) => {
        if (error) {
            alertLog.log(`[SYS ERR] ${error.message}`);
            return;
        }
        
        let complianceCount = 0;
        let tableData = [];
        
        if (response.storages) {
            response.storages.forEach(s => {
                tableData.push([
                    s.storage_id,
                    `${s.current_temp.toFixed(1)}°C`,
                    `${s.current_humidity.toFixed(1)}%`,
                    s.status,
                    new Date(s.last_update).toLocaleTimeString()
                ]);
                if (s.status === 'OK') complianceCount++;
            });
        }
        
        statusTable.setData({
            headers: ['Storage ID', 'Temp', 'Humidity', 'Status', 'Last Update'],
            data: tableData
        });

        // Update Gauge Speedometer berdasarkan tingkat kepatuhan system
        const total = response.storages.length || 1;
        const pct = Math.round((complianceCount / total) * 100);
        complianceGauge.setPercent(pct);
        
        if (pct === 100) {
            complianceGauge.options.stroke = 'green';
        } else if (pct >= 50) {
            complianceGauge.options.stroke = 'yellow';
        } else {
            complianceGauge.options.stroke = 'red';
        }
        
        screen.render();
    });
}

function fetchTemperatureHistory() {
    monitoringClient.GetStorageHistory({
        storage_id: 'FRIDGE-001',
        start_time: 0,
        end_time: Date.now(),
        limit: 15 // Ambil 15 data terakhir
    }, (error, response) => {
        if (error) return;
        
        if (response.readings && response.readings.length > 0) {
            // Karena history dari DB baru ke lama, kita balikkan agar lama ke baru (chart dari kiri ke kanan)
            const readings = response.readings.reverse();
            
            // Format jam "10:15:30"
            temperatureData.x = readings.map(r => new Date(r.timestamp).toLocaleTimeString().substring(0, 8));
            temperatureData.y = readings.map(r => r.temperature);
            
            lineChart.setData([temperatureData]);
            screen.render();
        }
    });
}

function watchAlertsStream() {
    const stream = alertClient.WatchAlerts({ min_severity: 0 });

    stream.on('data', (notification) => {
        const severityLabels = ['INFO', 'WARN', 'CRIT'];
        const alert = notification.alert;

        if (notification.notification_type === 'CONNECTED') {
            alertLog.log(`[SYS] ${alert.message}`);
        } else {
            const time = new Date(alert.triggered_at).toLocaleTimeString();
            const prefix = notification.notification_type === 'ALERT_RESOLVED' ? '[RESOLVED]' : `[${severityLabels[alert.severity]}]`;
            
            // Tulis warnanya melalui ANSI atau biarkan standar
            alertLog.log(`${time} ${prefix}`);
            alertLog.log(` > ${alert.storage_id}: ${alert.message}`);
        }
        screen.render();
    });

    stream.on('error', () => {
        alertLog.log('[SYS ERR] Alert streaming disconnected.');
    });
}

// ===================== RUN & INTERVALS =====================

// Initial Fetch
updateStorageTable();
fetchTemperatureHistory();
watchAlertsStream();

// Periodical Refresh (Setiap 5 detik)
setInterval(updateStorageTable, 5000);
setInterval(fetchTemperatureHistory, 5000);

// Key bindings untuk keluar dari aplikasi
screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
});

// Render pertama kali
screen.render();
