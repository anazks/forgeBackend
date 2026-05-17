const express = require('express');
const { getUsers, getMyCenters, getMyKitchens, getMyStores, getMyResorts, getMyAggregates, getMe, register, login, createUser, createAdmin, toggleUserStatus, updateUser, deleteUser } = require('../controllers/userController');

const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.get('/me', protect, getMe);

router.route('/')
    .get(protect, authorize('SUPER_ADMIN'), getUsers)
    .post(protect, authorize('SUPER_ADMIN'), createUser);
router.post('/register', register);
router.post('/login', login);
router.get('/my-centers', protect, authorize('SUPER_ADMIN', 'ADMIN'), getMyCenters);
router.get('/my-kitchens', protect, authorize('SUPER_ADMIN', 'ADMIN'), getMyKitchens);
router.get('/my-stores', protect, authorize('SUPER_ADMIN', 'ADMIN'), getMyStores);
router.get('/my-resorts', protect, authorize('SUPER_ADMIN', 'ADMIN'), getMyResorts);
router.get('/my-aggregates', protect, authorize('SUPER_ADMIN', 'ADMIN'), getMyAggregates);
router.post('/create-admin', protect, authorize('SUPER_ADMIN'), createAdmin);
router.put('/:id/toggle-status', protect, authorize('SUPER_ADMIN'), toggleUserStatus);

// Admin update/delete
router.route('/:id')
    .put(protect, authorize('SUPER_ADMIN'), updateUser)
    .delete(protect, authorize('SUPER_ADMIN'), deleteUser);

module.exports = router;
