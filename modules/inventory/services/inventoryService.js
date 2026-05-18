const Inventory = require('../models/inventoryModel');
const { AppError } = require('../../../middleware/errorHandler');

class InventoryService {
    async getInventoriesByEntity(entityId, isAdmin = false) {
        const query = isAdmin ? {} : { entity: entityId };
        return await Inventory.find(query)
            .lean()
            .select('locationId materialId currentStock');
    }
}

module.exports = new InventoryService();
