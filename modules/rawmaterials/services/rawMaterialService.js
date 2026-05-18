const RawMaterial = require('../models/rawMaterialModel');
const { AppError } = require('../../../middleware/errorHandler');

class RawMaterialService {
    async getRawMaterialsByEntity(entityId, isAdmin = false) {
        const query = isAdmin ? {} : { entity: entityId };
        return await RawMaterial.find(query)
            .lean()
            .select('name unit minimumStock currentStock');
    }

    async adjustStock(id, amount) {
        const rm = await RawMaterial.findByIdAndUpdate(id, {
            $inc: { currentStock: amount }
        }, { new: true });
        
        if (!rm) {
            throw new AppError('Raw Material not found', 404);
        }
        return rm;
    }
}

module.exports = new RawMaterialService();
