const express = require('express');
const { getBoms, createBom, updateBom, deleteBom } = require('../controllers/bomController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getBoms)
    .post(protect, createBom);

router.route('/:id')
    .put(protect, updateBom)
    .delete(protect, deleteBom);

module.exports = router;
