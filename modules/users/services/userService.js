const User = require('../models/model');
const { AppError } = require('../../../middleware/errorHandler');

class UserService {
    async getUserById(userId) {
        return await User.findById(userId).lean();
    }

    async isRestaurant(userId) {
        const user = await User.findById(userId).select('role').lean();
        return user ? user.role === 'RESTAURANT' : false;
    }

    async deleteUser(id) {
        const user = await User.findById(id);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        // 1. Check if configured as a preparation location in BOMs
        const Bom = require('../../boms/models/bomModel');
        const referencedBoms = await Bom.find({ preparationLocation: id }).select('dishName').lean();
        if (referencedBoms.length > 0) {
            const dishNames = referencedBoms.map(b => `"${b.dishName}"`).join(', ');
            throw new AppError(`Deletion not possible: This location is configured as the preparation location for dish(es): ${dishNames}.`, 400);
        }

        // 2. Check active Internal Orders (dispatches/receipts)
        const InternalOrder = require('../../production/models/internalOrderModel');
        const activeOrders = await InternalOrder.find({
            $or: [{ sourceLocation: id }, { destinationLocation: id }],
            status: { $nin: ['RECEIVED', 'CLOSED'] }
        }).lean();
        if (activeOrders.length > 0) {
            throw new AppError('Deletion not possible: This location is associated with active production or dispatch orders.', 400);
        }

        // 3. Check inventory stock levels
        const Inventory = require('../../inventory/models/inventoryModel');
        const activeInventories = await Inventory.find({
            locationId: id,
            currentStock: { $gt: 0 }
        }).lean();
        if (activeInventories.length > 0) {
            throw new AppError('Deletion not possible: This location has active stock remaining in its local inventory.', 400);
        }

        // If user is an admin linked to an entity, pull them from the entity admins list
        if (user.entity) {
            const Entity = require('../../entities/models/Entity');
            await Entity.findByIdAndUpdate(user.entity, {
                $pull: { admins: user._id }
            });
        }

        await user.deleteOne();
        return true;
    }
}

module.exports = new UserService();
