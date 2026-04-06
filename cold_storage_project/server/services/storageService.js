/**
 * ============================================================
 *  CryoMedics - StorageService Handler (gRPC)
 * ============================================================
 *  Handler gRPC untuk StorageService:
 *  - RegisterStock (Unary)
 *  - GetInventory (Unary)
 *  - RemoveBatch (Unary)
 * ============================================================
 */

const storageLogic = require('../logic/storageLogic');

const storageServiceHandlers = {

    /**
     * RegisterStock - Mendaftarkan batch baru ke kulkas medis
     * RPC Type: Unary
     */
    async RegisterStock(call, callback) {
        const batchData = call.request;

        console.log(`\n[StorageService] 📦 RegisterStock request → batch: '${batchData.batch_id}' to storage: '${batchData.storage_id}'`);

        try {
            const result = await storageLogic.registerStock(batchData);
            callback(null, result);
        } catch (error) {
            console.error('[StorageService] ❌ RegisterStock error:', error.message);
            callback({
                code: 13, // INTERNAL
                message: error.message
            });
        }
    },

    /**
     * GetInventory - Mengambil inventaris dari storage tertentu
     * RPC Type: Unary
     */
    async GetInventory(call, callback) {
        const { storage_id } = call.request;

        console.log(`\n[StorageService] 📋 GetInventory request → storage: '${storage_id}'`);

        try {
            const result = await storageLogic.getInventory(storage_id);
            console.log(`[StorageService] → Found ${result.batches.length} batches in '${storage_id}'`);
            callback(null, result);
        } catch (error) {
            console.error('[StorageService] ❌ GetInventory error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    },

    /**
     * RemoveBatch - Menghapus batch dari storage
     * RPC Type: Unary
     */
    async RemoveBatch(call, callback) {
        const { batch_id, reason } = call.request;

        console.log(`\n[StorageService] 🗑️  RemoveBatch request → batch: '${batch_id}' | Reason: ${reason}`);

        try {
            const result = await storageLogic.removeBatch(batch_id, reason);
            callback(null, result);
        } catch (error) {
            console.error('[StorageService] ❌ RemoveBatch error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    }
};

module.exports = storageServiceHandlers;
