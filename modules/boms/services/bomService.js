const Bom = require('../models/bomModel');
const { AppError } = require('../../../middleware/errorHandler');

class BomService {
    async getBomsByEntity(entityId, isAdmin = false) {
        const query = isAdmin ? {} : { entity: entityId };
        return await Bom.find(query)
            .lean()
            .select('menuItem entity dishName unit preparationLocation items');
    }
}

module.exports = new BomService();
