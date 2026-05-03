const express = require('express');
const { getMenus, createMenu, updateMenu, deleteMenu } = require('../controllers/menuController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getMenus)
    .post(protect, createMenu);

router.route('/:id')
    .put(protect, updateMenu)
    .delete(protect, deleteMenu);

module.exports = router;
