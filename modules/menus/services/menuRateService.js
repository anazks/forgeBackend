const MenuRate = require('../models/menuRateModel');
const Menu = require('../models/menuModel');
const Bom = require('../../boms/models/bomModel');
const User = require('../../users/models/model');
const { AppError } = require('../../../middleware/errorHandler');

class MenuRateService {
    /**
     * Get pricing rates for an entity, optionally filtered by center/location
     */
    async getRatesByEntity(entityId, locationId, isAdmin = false) {
        const query = {};
        
        if (entityId) {
            query.entity = entityId;
        }

        if (!isAdmin && locationId) {
            query.$or = [
                { center: locationId },
                { center: null }
            ];
        }

        return await MenuRate.find(query)
            .populate('menu', 'name unit')
            .populate('bom', 'dishName kitchenPrice unit')
            .populate('center', 'name role')
            .select('menu bom center rate centerRate entity')
            .lean();
    }

    /**
     * Create or update a pricing rate (Admin/COO only)
     * If rate/centerRate is null, undefined, or empty, it deletes the document.
     */
    async updateRate(payload, reqUser) {
        const { menuId, bomId, centerId, rate, centerRate } = payload;

        if (!reqUser) {
            throw new AppError('User authentication required', 401);
        }

        // Only Admin, SuperAdmin, and COO are allowed to configure rates
        const ALLOWED_ADMINS = ['SUPER_ADMIN', 'ADMIN', 'COO'];
        if (!ALLOWED_ADMINS.includes(reqUser.role)) {
            throw new AppError('Unauthorized: Only Admin/COO can configure pricing rates', 403);
        }

        if (!menuId && !bomId) {
            throw new AppError('Please provide menuId or bomId', 400);
        }

        let query = { center: centerId || null };
        if (menuId) query.menu = menuId;
        if (bomId) query.bom = bomId;

        const isGlobal = !centerId;
        const targetValue = isGlobal ? rate : centerRate;

        // If target value is empty/null/undefined, delete the rate record
        const isClearing = targetValue === null || targetValue === undefined || targetValue === '';

        if (isClearing) {
            await MenuRate.deleteOne(query);
            return null;
        }

        let menuRate = await MenuRate.findOne(query);

        if (menuRate) {
            if (isGlobal) {
                menuRate.rate = Number(targetValue);
            } else {
                menuRate.centerRate = Number(targetValue);
            }
            await menuRate.save();
        } else {
            // Find Entity Context
            let finalEntity = reqUser.entity;
            if (!finalEntity && centerId) {
                const centerUser = await User.findById(centerId).lean().select('entity');
                if (centerUser) finalEntity = centerUser.entity;
            }
            if (!finalEntity) {
                const fallbackUser = await User.findOne({ entity: { $ne: null } }).lean().select('entity');
                if (fallbackUser) finalEntity = fallbackUser.entity;
            }

            if (!finalEntity) {
                throw new AppError('Entity context not found. Please contact admin.', 400);
            }

            menuRate = await MenuRate.create({
                menu: menuId || undefined,
                bom: bomId || undefined,
                center: centerId || undefined,
                rate: isGlobal ? Number(targetValue) : 0,
                centerRate: isGlobal ? 0 : Number(targetValue),
                entity: finalEntity
            });
        }

        return menuRate;
    }

    /**
     * Bulk save pricing rates for a specific dish / menu item
     */
    async updateRatesBulk(ratesArray, reqUser) {
        if (!reqUser) {
            throw new AppError('User authentication required', 401);
        }

        const ALLOWED_ADMINS = ['SUPER_ADMIN', 'ADMIN', 'COO'];
        if (!ALLOWED_ADMINS.includes(reqUser.role)) {
            throw new AppError('Unauthorized: Only Admin/COO can configure pricing rates', 403);
        }

        if (!ratesArray || !Array.isArray(ratesArray)) {
            throw new AppError('Invalid rates payload: must be an array', 400);
        }

        const results = [];
        for (const item of ratesArray) {
            const updated = await this.updateRate(item, reqUser);
            if (updated) {
                results.push(updated);
            }
        }
        return results;
    }

    /**
     * Validation helper for future P/L calculations to flag missing pricing rates
     */
    async validateLocationPricing(entityId, locationId, itemsList) {
        if (!entityId || !locationId || !itemsList || !Array.isArray(itemsList)) {
            return { isPricingComplete: true, missingItems: [] };
        }

        const rates = await MenuRate.find({ entity: entityId, center: locationId })
            .select('menu bom rate centerRate')
            .lean();

        const missingItems = [];

        itemsList.forEach(item => {
            const itemId = item.bomId || item.menuId;
            if (!itemId) return;

            const rateRecord = rates.find(r => 
                (item.menuId && r.menu?.toString() === item.menuId.toString()) ||
                (item.bomId && r.bom?.toString() === item.bomId.toString())
            );

            if (!rateRecord) {
                missingItems.push({
                    itemName: item.itemName || 'Unknown Item',
                    error: 'No pricing configuration found for this location'
                });
            } else {
                if (rateRecord.centerRate === undefined || rateRecord.centerRate === null) {
                    missingItems.push({
                        itemName: item.itemName || 'Unknown Item',
                        error: 'Missing Sale Price (centerRate)'
                    });
                }
            }
        });

        return {
            isPricingComplete: missingItems.length === 0,
            missingItems
        };
    }
}

module.exports = new MenuRateService();
