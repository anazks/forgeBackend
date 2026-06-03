const express = require('express');
const { getBoms, createBom, updateBom, deleteBom } = require('../controllers/bomController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getBoms)
    .post(protect, authorize('ADMIN', 'SUPER_ADMIN', 'COO'), createBom);

router.route('/:id')
    .put(protect, authorize('ADMIN', 'SUPER_ADMIN', 'COO'), updateBom)
    .delete(protect, authorize('ADMIN', 'SUPER_ADMIN', 'COO'), deleteBom);

module.exports = router;
