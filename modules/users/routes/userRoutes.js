const express = require('express');
const { getUsers, getMyCenters, getMyKitchens, getMyStores, getMyResorts, getMyAggregates, getMe, register, login, createUser, createAdmin, toggleUserStatus, updateUser, deleteUser } = require('../controllers/userController');

const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.get('/me', protect, getMe);

router.route('/')
    .get(protect, authorize('SUPER_ADMIN', 'COO'), getUsers)
    .post(protect, authorize('SUPER_ADMIN', 'COO'), createUser);
router.post('/register', register);
router.post('/login', login);
router.get('/my-centers', protect, authorize('SUPER_ADMIN', 'ADMIN', 'COO'), getMyCenters);
router.get('/my-kitchens', protect, authorize('SUPER_ADMIN', 'ADMIN', 'COO'), getMyKitchens);
router.get('/my-stores', protect, authorize('SUPER_ADMIN', 'ADMIN', 'COO'), getMyStores);
router.get('/my-resorts', protect, authorize('SUPER_ADMIN', 'ADMIN', 'COO'), getMyResorts);
router.get('/my-aggrigates', protect, authorize('SUPER_ADMIN', 'ADMIN', 'COO'), getMyAggregates);
router.post('/create-admin', protect, authorize('SUPER_ADMIN', 'COO'), createAdmin);
router.put('/:id/toggle-status', protect, authorize('SUPER_ADMIN', 'COO'), toggleUserStatus);

// Admin update/delete
router.route('/:id')
    .put(protect, authorize('SUPER_ADMIN', 'COO'), updateUser)
    .delete(protect, authorize('SUPER_ADMIN', 'COO'), deleteUser);

module.exports = router;
