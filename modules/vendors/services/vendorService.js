const Vendor = require('../models/vendorModel');
const { AppError } = require('../../../middleware/errorHandler');

class VendorService {
    async deleteVendor(id, entityId, userRole) {
        const vendor = await Vendor.findById(id);
        if (!vendor) {
            throw new AppError('Vendor not found', 404);
        }

        if (userRole !== 'SUPER_ADMIN' && vendor.entity?.toString() !== entityId?.toString()) {
            throw new AppError('Not authorized to delete this vendor', 401);
        }

        // 1. Check open Purchase Requests
        const PurchaseRequest = require('../../purchases/models/purchaseRequestModel');
        const openPRs = await PurchaseRequest.find({
            vendor: id,
            status: { $in: ['PENDING', 'APPROVED', 'BILLED'] }
        }).select('prCode').lean();
        if (openPRs.length > 0) {
            const prCodes = openPRs.map(p => p.prCode || 'N/A').join(', ');
            throw new AppError(`Deletion not possible due to open purchase requests: ${prCodes}.`, 400);
        }

        // 2. Check open / unpaid purchase Bills
        const Bill = require('../../purchases/models/billModel');
        const openBills = await Bill.find({
            vendor: id,
            paymentStatus: { $ne: 'PAID' }
        }).populate('purchaseRequest', 'prCode').lean();
        if (openBills.length > 0) {
            const prCodes = openBills.map(b => b.purchaseRequest?.prCode || b.billCode || 'unpaid bill').join(', ');
            throw new AppError(`Deletion not possible due to open/unpaid bills: ${prCodes}.`, 400);
        }

        await vendor.deleteOne();
        return true;
    }
}

module.exports = new VendorService();
