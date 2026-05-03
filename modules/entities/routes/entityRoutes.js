const express = require('express');
const { createEntity, getEntities, getAdminsByEntity, createEntityWithAdmin, addAdminToEntity } = require('../controllers/entityController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

// Only Super Admin can create/view entities and add admins
router.route('/')
    .get(protect, authorize('SUPER_ADMIN'), getEntities)
    .post(protect, authorize('SUPER_ADMIN'), createEntity);

router.get('/:id/admins', protect, authorize('SUPER_ADMIN', 'ADMIN'), getAdminsByEntity);
router.post('/create-with-admin', protect, authorize('SUPER_ADMIN'), createEntityWithAdmin);
router.post('/:id/add-admin', protect, authorize('SUPER_ADMIN'), addAdminToEntity);

module.exports = router;
