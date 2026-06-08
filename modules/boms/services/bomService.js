const Bom = require('../models/bomModel');
const { AppError } = require('../../../middleware/errorHandler');

class BomService {
    async getBomsByEntity(entityId, isAdmin = false) {
        const query = isAdmin ? {} : { entity: entityId };
        const boms = await Bom.find(query).lean();
        
        const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
        const rawMaterials = await RawMaterial.find(isAdmin ? {} : { entity: entityId }).lean();
        
        return boms.map(bom => {
            const resolvedItems = (bom.items || []).map(item => {
                if (item.type === 'BOM Item') {
                    const subBom = boms.find(b => b._id.toString() === item.materialId?.toString());
                    return {
                        ...item,
                        itemName: subBom ? subBom.dishName : item.itemName,
                        unit: subBom ? subBom.unit : item.unit,
                        customUnit: subBom ? subBom.customUnit : item.customUnit
                    };
                } else {
                    const rm = rawMaterials.find(r => r._id.toString() === item.materialId?.toString());
                    return {
                        ...item,
                        itemName: rm ? rm.name : item.itemName,
                        unit: rm ? rm.unit : item.unit,
                        customUnit: rm ? rm.customUnit : item.customUnit
                    };
                }
            });
            return {
                ...bom,
                items: resolvedItems
            };
        });
    }

    async deleteBom(id, entityId, userRole) {
        const bom = await Bom.findById(id);
        if (!bom) {
            throw new AppError('BOM not found', 404);
        }

        if (userRole !== 'SUPER_ADMIN' && bom.entity?.toString() !== entityId?.toString()) {
            throw new AppError('Not authorized to delete this BOM', 401);
        }

        // 1. Check nested BOM usage
        const nestedInBoms = await Bom.find({ "items.materialId": id, "items.type": "BOM Item" }).select('dishName').lean();
        if (nestedInBoms.length > 0) {
            const parentBoms = nestedInBoms.map(b => `"${b.dishName}"`).join(', ');
            throw new AppError(`Deletion not possible: This BOM is used as an ingredient recipe in other dish(es): ${parentBoms}.`, 400);
        }

        // 2. Check linked Menu items
        if (bom.menuItem) {
            const Menu = require('../../menus/models/menuModel');
            const linkedMenu = await Menu.findById(bom.menuItem).select('name').lean();
            if (linkedMenu) {
                throw new AppError(`Deletion not possible: This BOM is linked to published Menu Item(s): "${linkedMenu.name}".`, 400);
            }
        }

        // 3. Check active Food Requests (Stock Requests)
        const FoodRequest = require('../../stockrequests/models/stockRequestModel');
        const activeRequests = await FoodRequest.find({
            "requestedItems.bomId": id,
            status: { $in: ['PENDING', 'APPROVED'] }
        }).lean();
        if (activeRequests.length > 0) {
            throw new AppError('Deletion not possible: There are active stock requests pending for this dish.', 400);
        }

        // 4. Check active production dispatches
        const InternalOrder = require('../../production/models/internalOrderModel');
        const activeOrders = await InternalOrder.find({
            "items.bomId": id,
            status: { $in: ['PENDING', 'PARTIAL_DISPATCH', 'DISPATCHED', 'PARTIAL_RECEIPT'] }
        }).populate('destinationLocation', 'name').lean();
        if (activeOrders.length > 0) {
            const orderDetails = activeOrders.map(o => `Order to "${o.destinationLocation?.name || 'Outlet'}" (Status: ${o.status})`).join(', ');
            throw new AppError(`Deletion not possible due to active production/dispatch orders: ${orderDetails}.`, 400);
        }

        // 5. Check active banquet/function orders
        const FunctionOrder = require('../../functionorders/models/functionOrderModel');
        const activeBanquets = await FunctionOrder.find({
            "dishes.bomId": id,
            status: { $nin: ['CLOSED', 'ACKNOWLEDGED'] }
        }).select('foCode eventName').lean();
        if (activeBanquets.length > 0) {
            const eventDetails = activeBanquets.map(f => `${f.foCode || 'FO'} ("${f.eventName}")`).join(', ');
            throw new AppError(`Deletion not possible: This dish is booked in active banquet/function order(s): ${eventDetails}.`, 400);
        }

        await bom.deleteOne();
        return true;
    }
}

module.exports = new BomService();
