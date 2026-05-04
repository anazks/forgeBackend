const express = require('express');
const {
    getVendors,
    getVendor,
    createVendor,
    updateVendor,
    deleteVendor
} = require('../controllers/vendorController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getVendors)
    .post(protect, createVendor);

router.route('/:id')
    .get(protect, getVendor)
    .put(protect, updateVendor)
    .delete(protect, deleteVendor);

module.exports = router;
