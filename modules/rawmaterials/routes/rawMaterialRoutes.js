const express = require('express');
const {
    getRawMaterials,
    createRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    updateStock
} = require('../controllers/rawMaterialController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getRawMaterials)
    .post(protect, createRawMaterial);

router.route('/:id')
    .put(protect, updateRawMaterial)
    .delete(protect, deleteRawMaterial);

router.route('/:id/stock')
    .put(protect, updateStock);

module.exports = router;
