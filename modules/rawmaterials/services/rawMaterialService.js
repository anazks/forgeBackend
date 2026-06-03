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

    async deleteRawMaterial(id, entityId, userRole) {
        const rawMaterial = await RawMaterial.findById(id);
        if (!rawMaterial) {
            throw new AppError('Raw material not found', 404);
        }

        if (userRole !== 'SUPER_ADMIN' && rawMaterial.entity?.toString() !== entityId?.toString()) {
            throw new AppError('Not authorized to delete this raw material', 401);
        }

        // 1. Check usage in corresponding dish recipes (BOMs)
        const Bom = require('../../boms/models/bomModel');
        const referencedBoms = await Bom.find({ "items.materialId": id }).select('dishName').lean();
        if (referencedBoms.length > 0) {
            const dishNames = referencedBoms.map(b => `"${b.dishName}"`).join(', ');
            throw new AppError(`Deletion not possible due to usage of stock in corresponding dish: ${dishNames}.`, 400);
        }

        // 2. Check open Purchase Requests
        const PurchaseRequest = require('../../purchases/models/purchaseRequestModel');
        const openPRs = await PurchaseRequest.find({
            "items.item": id,
            status: { $in: ['PENDING', 'APPROVED', 'BILLED'] }
        }).select('prCode').lean();
        if (openPRs.length > 0) {
            const prCodes = openPRs.map(p => p.prCode || 'N/A').join(', ');
            throw new AppError(`Deletion not possible due to open PR with PR number: ${prCodes}.`, 400);
        }

        // 3. Check open purchase Bills (undelivered)
        const Bill = require('../../purchases/models/billModel');
        const openBills = await Bill.find({
            "items.item": id,
            deliveryStatus: { $ne: 'DELIVERED' }
        }).populate('purchaseRequest', 'prCode').lean();
        if (openBills.length > 0) {
            const prCodes = openBills.map(b => b.purchaseRequest?.prCode || b.billCode || 'unpaid bill').join(', ');
            throw new AppError(`Deletion not possible due to open bill: ${prCodes}.`, 400);
        }

        // 4. Check active stock in inventory
        const Inventory = require('../../inventory/models/inventoryModel');
        const activeInventories = await Inventory.find({
            materialId: id,
            currentStock: { $gt: 0 }
        }).populate('locationId', 'name').lean();
        if (activeInventories.length > 0) {
            const locations = activeInventories.map(inv => `"${inv.locationId?.name || 'Unknown Location'}" (Stock: ${inv.currentStock} ${rawMaterial.unit})`).join(', ');
            throw new AppError(`Deletion not possible due to active stock in inventory: ${locations}.`, 400);
        }

        await rawMaterial.deleteOne();
        return true;
    }
}

module.exports = new RawMaterialService();
