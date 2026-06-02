const express = require('express');
const {
    getRawMaterials,
    createRawMaterial,
    updateRawMaterial,
    deleteRawMaterial
} = require('../controllers/rawMaterialController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getRawMaterials)
    .post(protect, createRawMaterial);

router.route('/:id')
    .put(protect, updateRawMaterial)
    .delete(protect, deleteRawMaterial);

// /:id/stock route removed — manual stock update replaced by aggregate from Inventory collection

module.exports = router;
