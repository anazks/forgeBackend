const Bank = require('../models/bankModel');

// @desc    Get all banks
// @route   GET /api/banks
// @access  Private
exports.getBanks = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        } else if (req.query.entity) {
            query.entity = req.query.entity;
        }

        const banks = await Bank.find(query).populate('locations', 'name role');
        res.status(200).json({ success: true, count: banks.length, data: banks });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create bank
// @route   POST /api/banks
// @access  Private
exports.createBank = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }
        const bank = await Bank.create(req.body);
        res.status(201).json({ success: true, data: bank });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update bank
// @route   PUT /api/banks/:id
// @access  Private
exports.updateBank = async (req, res) => {
    try {
        const bank = await Bank.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!bank) return res.status(404).json({ success: false, error: 'Bank not found' });
        res.status(200).json({ success: true, data: bank });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete bank
// @route   DELETE /api/banks/:id
// @access  Private
exports.deleteBank = async (req, res) => {
    try {
        const bank = await Bank.findByIdAndDelete(req.params.id);
        if (!bank) return res.status(404).json({ success: false, error: 'Bank not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
