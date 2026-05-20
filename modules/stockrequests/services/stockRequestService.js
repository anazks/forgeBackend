const StockRequest = require('../models/stockRequestModel');
const mongoose = require('mongoose');
const { AppError } = require('../../../middleware/errorHandler');

const inventoryService = require('../../inventory/services/inventoryService');
const purchaseService = require('../../purchases/services/purchaseService');
const rawMaterialService = require('../../rawmaterials/services/rawMaterialService');
const bomService = require('../../boms/services/bomService');

class StockRequestService {
    async getDemandSummary(entityId, userRole, summaryDateStr) {
        const isAdmin = userRole === 'SUPER_ADMIN';
        
        let matchQuery = { status: { $in: ['PENDING', 'APPROVED', 'PARTIAL'] } };
        if (!isAdmin) {
            matchQuery.entity = new mongoose.Types.ObjectId(entityId);
        }

        let targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 1);

        if (summaryDateStr) {
            targetDate = new Date(summaryDateStr);
        }

        const targetStart = new Date(targetDate);
        targetStart.setHours(0, 0, 0, 0);

        const targetEnd = new Date(targetStart);
        targetEnd.setDate(targetEnd.getDate() + 1);

        matchQuery.deliveryDate = {
            $gte: targetStart,
            $lt: targetEnd
        };

        const requests = await StockRequest.find(matchQuery).lean();
        
        // Fetch dependencies via Service Layer (architecture-compliant)
        const boms = await bomService.getBomsByEntity(entityId, isAdmin);
        const rawMaterials = await rawMaterialService.getRawMaterialsByEntity(entityId, isAdmin);
        const inventories = await inventoryService.getInventoriesByEntity(entityId, isAdmin);
        const pendingBills = await purchaseService.getPendingBills(entityId, isAdmin);

        const demandMap = {}; // { locationId: { materialId: { qty, approvedQty, type, name, unit, moq } } }

        function addDemand(locationId, materialId, qty, approvedQty, isBom, name, unit, moq = 0) {
            if (!locationId || !materialId) return;
            const locStr = locationId.toString();
            const matStr = materialId.toString();

            if (!demandMap[locStr]) demandMap[locStr] = {};
            if (!demandMap[locStr][matStr]) {
                demandMap[locStr][matStr] = { qty: 0, approvedQty: 0, isBom, name, unit, moq };
            }
            demandMap[locStr][matStr].qty += qty;
            demandMap[locStr][matStr].approvedQty += approvedQty;
        }

        function processItem(item, qty, approvedQty, parentLocationId) {
            if (item.isMenuItem || item.bomId || item.menuId || item.type === 'BOM Item') {
                // It's a dish/BOM. Find BOM.
                const bomIdToFind = item.bomId || item.menuId || item.materialId;
                const bom = boms.find(b => 
                    b._id.toString() === bomIdToFind?.toString() || 
                    (b.menuItem && b.menuItem.toString() === bomIdToFind?.toString())
                );
                
                if (bom) {
                    const prepLoc = bom.preparationLocation?.toString() || parentLocationId;
                    
                    // Add demand for the dish itself (stock is always 0 for BOMs)
                    addDemand(prepLoc, bom._id.toString(), qty, approvedQty, true, bom.dishName, bom.unit || 'pcs');

                    // Explode ingredients
                    bom.items.forEach(ing => {
                        const ingQty = ing.quantity * qty;
                        const ingApprovedQty = ing.quantity * approvedQty;
                        if (ing.type === 'BOM Item') {
                            // Nested BOM recursion
                            processItem({ bomId: ing.materialId, isMenuItem: true }, ingQty, ingApprovedQty, prepLoc);
                        } else {
                            // Raw Material
                            const rm = rawMaterials.find(r => r._id.toString() === ing.materialId?.toString());
                            addDemand(prepLoc, ing.materialId.toString(), ingQty, ingApprovedQty, false, ing.itemName, ing.unit, rm ? rm.minimumStock : 0);
                        }
                    });
                } else {
                    // Fallback for Direct Menu Items that have no BOM.
                    const fallbackId = item.menuId || item.bomId || item.materialId;
                    if (fallbackId) {
                        addDemand(parentLocationId, fallbackId.toString(), qty, approvedQty, false, item.materialName, item.unit || 'unit', 0);
                    }
                }
            } else {
                // Direct Raw Material request from Center
                const rm = rawMaterials.find(r => r._id.toString() === item.material?.toString());
                if (rm) {
                    addDemand(parentLocationId, item.material.toString(), qty, approvedQty, false, item.materialName || rm.name, item.unit || rm.unit, rm.minimumStock || 0);
                }
            }
        }

        // Process all pending requests
        requests.forEach(req => {
            const reqCenterId = req.centerId?.toString();
            req.requestedItems.forEach(item => {
                if (item.approvalStatus === 'REJECTED') return;
                const qty = item.requestedQty;
                const approvedQty = item.approvalStatus === 'APPROVED' ? item.requestedQty : 0;
                processItem(item, qty, approvedQty, reqCenterId);
            });
        });

        // Calculate Gaps and format results
        const results = [];
        let totalOpenDemands = 0;

        for (const locId in demandMap) {
            for (const matId in demandMap[locId]) {
                const d = demandMap[locId][matId];
                let currentStock = 0;
                
                if (!d.isBom) {
                    // Non-perishable Raw Material: Check Inventory collection
                    const inv = inventories.find(i => i.locationId?.toString() === locId && i.materialId?.toString() === matId);
                    if (inv) currentStock = inv.currentStock;

                    // Add incoming stock from pending PRs (Bills)
                    const incoming = pendingBills.filter(b => b.destinationLocation?.toString() === locId);
                    incoming.forEach(b => {
                        b.items.forEach(i => {
                            if (i.item?.toString() === matId) {
                                currentStock += (i.quantity || 0);
                            }
                        });
                    });
                }
                
                const gap = d.qty - currentStock;
                const approvedGap = Math.max(0, d.approvedQty - currentStock);
                
                if (!d.isBom && approvedGap > 0) {
                    totalOpenDemands++;
                }

                results.push({
                    locationId: locId,
                    materialId: matId,
                    name: d.name,
                    type: d.isBom ? 'BOM' : 'MATERIAL',
                    unit: d.unit,
                    demand: d.qty,
                    approvedDemand: d.approvedQty,
                    // Single display value: approved qty if COO has acted, else raw demand
                    requestedStock: d.approvedQty > 0 ? d.approvedQty : d.qty,
                    stock: currentStock,
                    gap: gap,
                    approvedGap: approvedGap,
                    // Gap relative to requestedStock — shown in the Gap column
                    displayGap: d.approvedQty > 0 ? approvedGap : gap,
                    moq: d.moq || 0,
                    suggestedPrQty: Math.max(approvedGap, d.moq || 0)
                });
            }
        }

        return {
            date: targetStart,
            totalOpenDemands,
            data: results
        };
    }
}

module.exports = new StockRequestService();
