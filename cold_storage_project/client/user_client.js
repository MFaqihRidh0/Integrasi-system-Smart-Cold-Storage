/**
 * ============================================================
 *  💻 CryoMedics - Admin Client (TUI Dashboard)
 * ============================================================
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { v4: uuidv4 } = require('uuid');

// ===================== LOAD PROTO =====================

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'medicold.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: Number, enums: Number, defaults: true, oneofs: true
});
const medicoldProto = grpc.loadPackageDefinition(packageDefinition).medicold;

// ===================== CLIENT SETUP =====================

const SERVER_ADDRESS = 'localhost:50051';
const storageClient = new medicoldProto.StorageService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const monitoringClient = new medicoldProto.MonitoringService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const alertClient = new medicoldProto.AlertService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const reportClient = new medicoldProto.ReportService(SERVER_ADDRESS, grpc.credentials.createInsecure());

// ===================== USER STATE =====================

const MOCK_USERS = {
    'USR-001': { name: 'Dr. Andi', role: 'Head Pharmacist', department: 'Pharmacy' },
    'USR-002': { name: 'Suster Rina', role: 'Inventory Admin', department: 'Storage Room' },
    'USR-003': { name: 'Budi', role: 'Maintenance', department: 'Engineering' }
};

const userName = process.argv[2] || `User_${Math.floor(Math.random() * 100)}`;
const currentUserId = uuidv4();
MOCK_USERS[currentUserId.toUpperCase()] = {
    name: userName,
    role: userName === 'User_1' ? 'System Administrator' : 'Storage Operator',
    department: 'Central Control'
};

// ===================== UI SETUP =====================

const screen = blessed.screen({ smartCSR: true, title: 'CryoMedics User Console' });
// Enable key and mouse events globally to allow scrolling
screen.key(['tab'], function() { screen.focusNext(); });
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// 1. Overview (Kiri Atas)
const overviewBox = grid.set(0, 0, 3, 8, blessed.box, {
    label: ' System Overview ',
    content: ` Loading system info...`,
    style: { fg: 'cyan', border: { fg: 'cyan' } }
});

// 2. Output Console (Kiri Tengah)
const outputConsole = grid.set(3, 0, 6, 8, contrib.log, {
    label: ' Action Output (Use Mouse Wheel to Scroll) ',
    fg: 'green',
    selectedFg: 'green',
    mouse: true,
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '█', track: { bg: 'black' }, style: { fg: 'cyan' } }
});

// 3. Menu List (Kiri Bawah)
const menuList = grid.set(9, 0, 3, 8, blessed.list, {
    label: ' Main Menu (Use ↑/↓ and Enter) ',
    keys: true,
    interactive: true,
    style: {
        fg: 'white',
        selected: { bg: 'blue', fg: 'white', bold: true }
    },
    mouse: true,
    items: [
        '[1] Register Stok Baru',
        '[2] Lihat Inventaris',
        '[3] Hapus Batch',
        '[4] Lihat Semua Alert',
        '[5] Resolve Alert',
        '[6] Generate Daily Report',
        '[7] Export Data (CSV)',
        '[8] Cek Compliance Status',
        '[9] Cek Info User',
        '[0] Exit'
    ]
});

// 4. Live Alerts (Kanan Full)
const alertBoard = grid.set(0, 8, 12, 4, contrib.log, {
    label: ' Live Alert Board (Scrollable) ',
    fg: 'red',
    selectedFg: 'red',
    mouse: true,
    keys: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '█', track: { bg: 'black' }, style: { fg: 'red' } }
});

// Prompt Dialog (Hidden by Default)
const promptDialog = blessed.prompt({
    parent: screen,
    border: 'line',
    height: 'shrink',
    width: 'half',
    top: 'center',
    left: 'center',
    label: ' Input Required ',
    tags: true,
    keys: true,
    vi: true,
    hidden: true
});

// Message Dialog (Hidden by Default)
const msgDialog = blessed.message({
    parent: screen,
    border: 'line',
    height: 'shrink',
    width: 'half',
    top: 'center',
    left: 'center',
    label: ' System Message ',
    tags: true,
    keys: true,
    hidden: true
});

function ask(question) {
    return new Promise(resolve => {
        promptDialog.show();
        promptDialog.input(`{cyan-fg}${question}{/cyan-fg}`, '', (err, value) => {
            promptDialog.hide();
            screen.render();
            resolve(value || '');
        });
    });
}

function printOutput(text) {
    outputConsole.log(text);
    screen.render();
}

// ===================== WATCH ALERTS =====================

function startWatchingAlerts() {
    const metadata = new grpc.Metadata();
    metadata.add('user-id', currentUserId);
    
    const call = alertClient.WatchAlerts({ min_severity: 0 }, metadata);

    call.on('data', (response) => {
        const alert = response.alert;
        const type = response.notification_type;

        if (type === 'CONNECTED') {
            alertBoard.log(`[SYS] ${alert.message}`);
            screen.render();
            return;
        }

        const severityLabels = ['INFO', 'WARN', 'CRIT'];
        const time = new Date(alert.triggered_at).toLocaleTimeString();
        let prefix = type === 'ALERT_RESOLVED' ? '[RESOLVED]' : `[${severityLabels[alert.severity]}]`;
        
        alertBoard.log(`${time} ${prefix}`);
        alertBoard.log(` > ${alert.storage_id}: ${alert.message}`);
        
        if (type === 'ALERT_RESOLVED') {
            alertBoard.log(`   (by ${alert.resolved_by})`);
        }
        screen.render();
    });

    call.on('error', (error) => {
        if (error.code !== 1) alertBoard.log('[ERR] Alert Stream Disconnected');
    });
}

// ===================== ADMIN FUNCTIONS =====================

async function registerStock() {
    printOutput('--- REGISTER STOCK ---');
    const batch_id = await ask('Batch ID:');
    if(!batch_id) return printOutput('Cancelled.');
    const storage_id = await ask('Storage ID (e.g. FRIDGE-001):');
    const content_type = await ask('Jenis obat/vaksin:');
    const quantity = parseInt(await ask('Quantity:') || 0);
    const expiry_date = await ask('Expiry date (YYYY-MM-DD):');
    const notes = await ask('Catatan:');
    const min_temp = parseFloat(await ask('Min temp (°C):') || 0);
    const max_temp = parseFloat(await ask('Max temp (°C):') || 0);

    storageClient.RegisterStock({
        batch_id, storage_id, content_type, quantity,
        expiry_date, notes, min_temp, max_temp
    }, (error, response) => {
        if (error) printOutput(`[Error] ${error.message}`);
        else printOutput(`[Success] ${response.message}`);
    });
}

async function getInventory() {
    printOutput('--- LIHAT INVENTARIS ---');
    const storage_id = await ask('Storage ID (e.g. FRIDGE-001):');
    if(!storage_id) return printOutput('Cancelled.');

    storageClient.GetInventory({ storage_id }, (error, response) => {
        if (error) {
            printOutput(`[Error] ${error.message}`);
        } else {
            printOutput(`Inventory '${response.storage_id}':`);
            if (response.batches.length === 0) printOutput('  (Kosong)');
            else {
                response.batches.forEach((b, i) => {
                    printOutput(`  [${i + 1}] ${b.batch_id} - ${b.content_type}`);
                    printOutput(`      ├─ Qty    : ${b.quantity}`);
                    printOutput(`      ├─ Expiry : ${b.expiry_date || 'N/A'}`);
                    printOutput(`      ├─ Target : ${b.min_temp}°C to ${b.max_temp}°C`);
                    printOutput(`      └─ Notes  : ${b.notes || '-'}`);
                });
            }
        }
    });
}

async function removeBatch() {
    printOutput('--- HAPUS BATCH ---');
    const batch_id = await ask('Batch ID yang dihapus:');
    if(!batch_id) return printOutput('Cancelled.');
    const reason = await ask('Alasan penghapusan:');

    storageClient.RemoveBatch({ batch_id, reason }, (error, response) => {
        if (error) printOutput(`[Error] ${error.message}`);
        else printOutput(`[Success] ${response.message}`);
    });
}

async function getAlerts() {
    printOutput('--- DAFTAR ALERT AKTIF ---');
    const storage_id = await ask('Storage ID (kosong=Semua):');

    alertClient.GetAlerts({ storage_id: storage_id || '', severity: 0, resolved_only: false }, (error, response) => {
        if (error) {
            printOutput(`[Error] ${error.message}`);
        } else {
            printOutput(`Total Alerts: ${response.alerts.length}`);
            response.alerts.forEach((alert, i) => {
                const icon = alert.severity === 2 ? '[CRIT]' : alert.severity === 1 ? '[WARN]' : '[INFO]';
                printOutput(` ${icon} ID: ${alert.alert_id} | ${alert.storage_id}`);
                printOutput(`    Msg: ${alert.message}`);
            });
        }
    });
}

async function resolveAlert() {
    printOutput('--- RESOLVE ALERT ---');
    const alert_id = await ask('Alert ID:');
    if(!alert_id) return printOutput('Cancelled.');
    const resolution_notes = await ask('Catatan resolusi:');

    alertClient.ResolveAlert({
        alert_id, resolved_by: userName, resolution_notes
    }, (error, response) => {
        if (error) printOutput(`[Error] ${error.message}`);
        else printOutput(`[Success] ${response.message}`);
    });
}

async function generateDailyReport() {
    printOutput('--- DAILY REPORT ---');
    const date = await ask('Tanggal (YYYY-MM-DD):');
    const storage_id = await ask('Storage ID (kosong=Semua):');

    reportClient.GenerateDailyReport({
        date: date || new Date().toISOString().split('T')[0],
        storage_id: storage_id || ''
    }, (error, response) => {
        if (error) printOutput(`[Error] ${error.message}`);
        else {
            printOutput(`Report Date: ${response.report_date}`);
            printOutput(`Total Alerts: ${response.total_alerts} | Uptime: ${response.system_uptime_percentage}%`);
            response.storage_summaries.forEach(s => {
                printOutput(` [${s.storage_id}] Avg Temp: ${s.avg_temp}°C | Reading: ${s.total_readings}`);
            });
        }
    });
}

async function exportCSV() {
    printOutput('--- EXPORT DATA ---');
    const storage_id = await ask('Storage ID:');
    if(!storage_id) return printOutput('Cancelled.');

    reportClient.ExportCSV({
        storage_id, start_time: 0, end_time: Date.now(), format: 'CSV'
    }, (error, response) => {
        if (error) printOutput(`[Error] ${error.message}`);
        else {
            printOutput(`Export Berhasil!`);
            printOutput(` URL: ${response.download_url}`);
        }
    });
}

async function getComplianceStatus() {
    printOutput('--- COMPLIANCE STATUS ---');
    reportClient.GetComplianceStatus({ period_start: '', period_end: '' }, (error, response) => {
        if (error) printOutput(`[Error] ${error.message}`);
        else {
            printOutput(`Overall: ${response.overall_compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
            printOutput(`Avg Rate: ${response.average_compliance_rate}%`);
        }
    });
}

async function checkUserInfo() {
    printOutput('--- CEK INFO USER ---');
    const userId = await ask('Masukkan Target User ID:');
    if(!userId) return printOutput('Cancelled.');
    const searchId = userId.toUpperCase().trim();
    const user = MOCK_USERS[searchId];

    if (user) {
        printOutput(`User Found:`);
        printOutput(` Nama : ${user.name} ${searchId === currentUserId.toUpperCase() ? '(You)' : ''}`);
        printOutput(` Role : ${user.role}`);
        printOutput(` Dept : ${user.department}`);
    } else {
        printOutput(`[Warning] User '${userId}' tidak ditemukan.`);
    }
}

// ===================== MENU HANDLING =====================

menuList.on('select', async (item, index) => {
    switch(index) {
        case 0: await registerStock(); break;
        case 1: await getInventory(); break;
        case 2: await removeBatch(); break;
        case 3: await getAlerts(); break;
        case 4: await resolveAlert(); break;
        case 5: await generateDailyReport(); break;
        case 6: await exportCSV(); break;
        case 7: await getComplianceStatus(); break;
        case 8: await checkUserInfo(); break;
        case 9:
            screen.destroy();
            console.log('Session Ended. Goodbye!');
            process.exit(0);
            break;
    }
    menuList.focus(); // Return focus to menu after action
});

// Key bindings
screen.key(['escape', 'C-c'], function() {
    return process.exit(0);
});

// ===================== RUN =====================

function loadSystemOverview() {
    const user = MOCK_USERS[currentUserId.toUpperCase()];
    
    monitoringClient.GetAllStorageStatus({}, (error, response) => {
        let storageCount = 0;
        let onlineCount = 0;
        
        if (!error && response && response.storages) {
            storageCount = response.storages.length;
            onlineCount = response.storages.filter(s => s.status !== 'OFFLINE').length;
        }

        const info = [
            ` User Profile : ${user.name} | ${user.role} (${user.department})`,
            ` Session ID   : ${currentUserId}`,
            ` Target Host  : ${SERVER_ADDRESS}`,
            ` Node Status  : ${onlineCount}/${storageCount} Storages Online`
        ].join('\n');

        overviewBox.setContent('\n' + info);
        screen.render();
    });
}

loadSystemOverview();
printOutput('Starting System...');
startWatchingAlerts();

menuList.focus();
screen.render();
