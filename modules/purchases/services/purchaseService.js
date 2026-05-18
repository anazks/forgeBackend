const Purchase = require('../models/purchaseModel');
const PurchaseRequest = require('../models/purchaseRequestModel');
const Bill = require('../models/billModel');
const { AppError } = require('../../../middleware/errorHandler');

class PurchaseService {
    /**
     * Returns the first PENDING Bill that already covers any of the given
     * materialIds for the specified destinationLocation.
     * Used to enforce the duplicate-PR guard across ALL roles (SM + COO).
     *
     * @param {string[]} materialIds   - Array of raw material ObjectId strings
     * @param {string}   locationId    - destinationLocation ObjectId string
     * @param {string}   [entityId]    - Entity scope (omit for SUPER_ADMIN)
     * @returns {object|null} Existing Bill doc (lean) or null if no duplicate
     */
    async findDuplicatePendingPR(materialIds, locationId, entityId) {
        const query = {
            deliveryStatus: 'PENDING',
            destinationLocation: locationId,
            'items.item': { $in: materialIds }
        };
        if (entityId) query.entity = entityId;

        return await Bill.findOne(query)
            .lean()
            .select('purchaseRequest destinationLocation items')
            .populate('purchaseRequest', 'prCode');
    }

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
