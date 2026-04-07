const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load Proto

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'medicold.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: Number,
    enums: Number,
    defaults: true,
    oneofs: true
});

const medicoldProto = grpc.loadPackageDefinition(packageDefinition).medicold;

// Client Setup

const SERVER_ADDRESS = 'localhost:50051';
const monitoringClient = new medicoldProto.MonitoringService(
    SERVER_ADDRESS,
    grpc.credentials.createInsecure()
);

// Sensor Configuration

const SENSOR_CONFIG = {
    storage_id: 'FRIDGE-001',
    sensor_id: 'SENSOR-TH-001',
    base_temperature: -20.0,       // Suhu dasar kulkas (-20°C untuk FRIDGE-001)
    base_humidity: 45.0,           // Kelembaban dasar
    base_pressure: 1013.25,        // Tekanan atmosfer standar (hPa)
    interval_ms: 2000,             // Interval pengiriman tiap 2 detik agar lebih terasa real-time
    readings_per_session: 30,      // Kirim 30 data per sesi (kurang lebih 1 menit)
    anomaly_probability: 0.10      // 10% kemungkinan anomali acak
};

let sessionCounter = 1;

// Helper Functions

/**
 * Simulasi pembacaan sensor dengan fluktuasi realistis
 */
function generateReading(config, readingIndex) {
    let temperature = config.base_temperature;
    let humidity = config.base_humidity;
    let pressure = config.base_pressure;

    // Fluktuasi normal (±0.5°C)
    temperature += (Math.random() - 0.5) * 1.5;
    humidity += (Math.random() - 0.5) * 3.0;
    pressure += (Math.random() - 0.5) * 2.0;

    // Simulasi anomali acak (Pintu terbuka atau kompresor mati sesaat)
    if (Math.random() < config.anomaly_probability) {
        temperature += 10 + Math.random() * 8; // Suhu tiba-tiba naik 10-18°C
        humidity += 15;
        console.log(`   [WARNING] ⚠️ SPONTANEOUS ANOMALY (Door open/Compressor spike)!`);
    }

    return {
        storage_id: config.storage_id,
        temperature: Math.round(temperature * 100) / 100,
        humidity: Math.round(humidity * 100) / 100,
        pressure: Math.round(pressure * 100) / 100,
        timestamp: Date.now(),
        sensor_id: config.sensor_id
    };
}

// Main: Continuous Sessions

function startSensorStreamSession() {
    console.log('');
    console.log('------------------------------------------------------');
    console.log(` [System] CryoMedics - Sensor Client | Sesi #${sessionCounter}`);
    console.log('------------------------------------------------------');
    if (sessionCounter === 1) {
        console.log(` [System] Connecting to: ${SERVER_ADDRESS}`);
        console.log(` [System] Storage: ${SENSOR_CONFIG.storage_id}`);
        console.log(` [System] Sensor: ${SENSOR_CONFIG.sensor_id}`);
    }
    console.log(` [System] Interval: ${SENSOR_CONFIG.interval_ms}ms`);
    console.log(` [System] Target readings per session: ${SENSOR_CONFIG.readings_per_session}`);
    console.log('------------------------------------------------------');
    console.log('');

    // Membuat client-side stream
    const stream = monitoringClient.StreamTelemetry((error, summary) => {
        if (error) {
            console.error('\n[Error] StreamTelemetry error:', error.message);
            // Coba reconnect dalam 5 detik jika error
            setTimeout(startSensorStreamSession, 5000);
            return;
        }

        // Server mengirim summary setelah sebuah sesi stream selesai
        console.log('\n');
        console.log('------------------------------------------------------');
        console.log(` [Report] TELEMETRY SUMMARY (Session #${sessionCounter})`);
        console.log('------------------------------------------------------');
        console.log(` > Storage ID       : ${summary.storage_id}`);
        console.log(` > Total Packets    : ${summary.total_packets_received}`);
        console.log(` > Avg Temperature  : ${summary.avg_temperature.toFixed(2)}°C`);
        console.log(` > Min Temperature  : ${summary.min_temperature.toFixed(2)}°C`);
        console.log(` > Max Temperature  : ${summary.max_temperature.toFixed(2)}°C`);
        console.log(` > Avg Humidity     : ${summary.avg_humidity.toFixed(2)}%`);
        console.log(` > Anomaly Count    : ${summary.anomaly_count}`);
        console.log(` > Critical Alert   : ${summary.has_critical_alert ? 'YES 🔴' : 'NO 🟢'}`);
        console.log(` > Session Start    : ${summary.session_start}`);
        console.log(` > Session End      : ${summary.session_end}`);
        console.log('------------------------------------------------------');

        sessionCounter++;
        console.log(`\n[System] Memulai ulang sensor untuk sesi #${sessionCounter} dalam 3 detik...`);

        // Memulai stream berikutnya secara otomatis (Continuous loop)
        setTimeout(startSensorStreamSession, 3000);
    });

    // Kirim data sensor secara berkala
    let readingCount = 0;

    console.log(`[System] Starting telemetry stream for '${SENSOR_CONFIG.storage_id}'...\n`);

    const sendInterval = setInterval(() => {
        if (readingCount >= SENSOR_CONFIG.readings_per_session) {
            clearInterval(sendInterval);

            console.log(`\n[System] Sesi #${sessionCounter} selesai (${SENSOR_CONFIG.readings_per_session} readings). Mengirim permintaan summary ke server...`);

            // Tutup stream (trigger server untuk memproses dan mengirim summary)
            stream.end();
            return;
        }

        const reading = generateReading(SENSOR_CONFIG, readingCount);

        // Kirim ke server via stream
        stream.write(reading);

        const statusIcon = reading.temperature > (SENSOR_CONFIG.base_temperature + 8) ? '🔴 [CRITICAL]' :
            reading.temperature > (SENSOR_CONFIG.base_temperature + 3) ? '🟡 [WARNING] ' : '🟢 [OK]       ';

        console.log(`   ${statusIcon} [${readingCount + 1}/${SENSOR_CONFIG.readings_per_session}] Temp: ${reading.temperature.toFixed(2)}°C | Hum: ${reading.humidity.toFixed(2)}% | Press: ${reading.pressure.toFixed(2)} hPa`);

        readingCount++;
    }, SENSOR_CONFIG.interval_ms);
}

// ===================== RUN =====================

// Tangkap sinyal terminasi untuk clean exit
process.on('SIGINT', () => {
    console.log('\n[System] Mematikan Sensor Client...');
    process.exit(0);
});

startSensorStreamSession();
