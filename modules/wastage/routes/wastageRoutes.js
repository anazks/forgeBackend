const express = require('express');
const { getTodayWastage, saveWastage, getAllWastage } = require('../controllers/wastageController');
const { protect } = require('../../../middleware/auth'); // Ensure standard auth

const router = express.Router();

router.use(protect);

router.get('/today', getTodayWastage);
router.get('/', getAllWastage);
router.post('/', saveWastage);

module.exports = router;
