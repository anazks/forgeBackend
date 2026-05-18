const Purchase = require('../models/purchaseModel');
const PurchaseRequest = require('../models/purchaseRequestModel');
const Bill = require('../models/billModel');
const { AppError } = require('../../../middleware/errorHandler');

class PurchaseService {
    async getPendingBills(entityId, isAdmin = false) {
        const query = { deliveryStatus: 'PENDING' };
        if (!isAdmin) {
            query.entity = entityId;
        }
        return await Bill.find(query)
            .lean()
            .select('destinationLocation items');
    }

    async getPurchasesByEntity(entityId, isAdmin = false) {
        const query = isAdmin ? {} : { entity: entityId };
        return await Purchase.find(query)
            .lean()
            .select('purchaseDate totalCost quantity item vendor')
            .populate('item', 'name unit')
            .populate('vendor', 'vendorName')
            .sort({ purchaseDate: -1 });
    }

    async createPurchase(data) {
        if (data.vendor === '') {
            delete data.vendor;
        }
        return await Purchase.create(data);
    }

    async deletePurchase(id) {
        const purchase = await Purchase.findById(id);
        if (!purchase) {
            throw new AppError('Purchase not found', 404);
        }
        
        const itemId = purchase.item;
        const quantity = purchase.quantity;

        await purchase.deleteOne();
        return { itemId, quantity };
    }
}

module.exports = new PurchaseService();
