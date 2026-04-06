/**
 * ============================================================
 *  CryoMedics - Storage Logic (Business Logic)
 * ============================================================
 *  Menangani logika bisnis untuk manajemen stok & inventaris:
 *  - RegisterStock: mendaftarkan batch baru ke kulkas
 *  - GetInventory: mengambil daftar batch di kulkas tertentu
 *  - RemoveBatch: menghapus batch dari kulkas
 * ============================================================
 */

const store = require('../state/dbStore');

const storageLogic = {

    /**
     * Mendaftarkan batch obat/vaksin baru ke storage tertentu
     */
    async registerStock(batchData) {
        // Validasi storage_id harus ada
        const storage = await store.getStorage(batchData.storage_id);
        if (!storage) {
            return {
                success: false,
                message: `Storage unit '${batchData.storage_id}' tidak ditemukan dalam sistem`
            };
        }

        // Validasi batch_id tidak boleh duplikat
        const existingBatch = await store.getBatch(batchData.batch_id);
        if (existingBatch) {
            return {
                success: false,
                message: `Batch '${batchData.batch_id}' sudah terdaftar di storage '${existingBatch.storage_id}'`
            };
        }

        // Validasi suhu range
        if (batchData.min_temp >= batchData.max_temp) {
            return {
                success: false,
                message: `Range suhu tidak valid: min_temp (${batchData.min_temp}) harus lebih kecil dari max_temp (${batchData.max_temp})`
            };
        }

        // Validasi quantity
        if (!batchData.quantity || batchData.quantity <= 0) {
            return {
                success: false,
                message: 'Quantity harus lebih dari 0'
            };
        }

        // Simpan batch
        await store.addBatch({
            batch_id: batchData.batch_id,
            storage_id: batchData.storage_id,
            content_type: batchData.content_type || 'Unknown',
            quantity: batchData.quantity,
            expiry_date: batchData.expiry_date || '',
            notes: batchData.notes || '',
            min_temp: batchData.min_temp,
            max_temp: batchData.max_temp
        });

        console.log(`[StorageLogic] ✅ Batch '${batchData.batch_id}' registered → Storage '${batchData.storage_id}' | Type: ${batchData.content_type} | Qty: ${batchData.quantity}`);

        return {
            success: true,
            message: `Batch '${batchData.batch_id}' berhasil didaftarkan ke storage '${batchData.storage_id}'`
        };
    },

    /**
     * Mengambil semua batch yang ada di storage tertentu
     */
    async getInventory(storageId) {
        const storage = await store.getStorage(storageId);
        if (!storage) {
            return {
                storage_id: storageId,
                batches: [],
                last_updated: 0
            };
        }

        const batches = await store.getBatchesByStorage(storageId);

        return {
            storage_id: storageId,
            batches: batches,
            last_updated: storage.last_update
        };
    },

    /**
     * Menghapus/mengeluarkan batch dari storage
     */
    async removeBatch(batchId, reason) {
        const removed = await store.removeBatch(batchId);

        if (!removed) {
            return {
                success: false,
                message: `Batch '${batchId}' tidak ditemukan dalam sistem`
            };
        }

        console.log(`[StorageLogic] 🗑️  Batch '${batchId}' removed from '${removed.storage_id}' | Reason: ${reason}`);

        return {
            success: true,
            message: `Batch '${batchId}' berhasil dihapus dari storage '${removed.storage_id}'. Alasan: ${reason}`
        };
    }
};

module.exports = storageLogic;
