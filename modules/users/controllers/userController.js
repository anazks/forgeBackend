const User = require('../models/model');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/SuperAdmin
exports.getUsers = async (req, res, next) => {
    try {
        const users = await User.find().populate('entity');
        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get my centers
// @route   GET /api/users/my-centers
// @access  Private
exports.getMyCenters = async (req, res, next) => {
    try {
        let query = { role: 'CENTERS' };
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }
        const centers = await User.find(query).populate('entity');
        res.status(200).json({ success: true, count: centers.length, data: centers });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get my kitchens
// @route   GET /api/users/my-kitchens
// @access  Private
exports.getMyKitchens = async (req, res, next) => {
    try {
        let query = { role: 'KITCHEN' };
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }
        const kitchens = await User.find(query).populate('entity');
        res.status(200).json({ success: true, count: kitchens.length, data: kitchens });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get my stores
// @route   GET /api/users/my-stores
// @access  Private
exports.getMyStores = async (req, res, next) => {
    try {
        let query = { role: 'STORE' };
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }
        const stores = await User.find(query).populate('entity');
        res.status(200).json({ success: true, count: stores.length, data: stores });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get my resorts
// @route   GET /api/users/my-resorts
// @access  Private
exports.getMyResorts = async (req, res, next) => {
    try {
        let query = { role: 'RESORT' };
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }
        const resorts = await User.find(query).populate('entity');
        res.status(200).json({ success: true, count: resorts.length, data: resorts });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get my aggregates
// @route   GET /api/users/my-aggrigates
// @access  Private
exports.getMyAggregates = async (req, res, next) => {
    try {
        let query = { role: 'AGGRIGATE' };
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }
        const aggregates = await User.find(query).populate('entity');
        res.status(200).json({ success: true, count: aggregates.length, data: aggregates });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Register user
exports.register = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        const user = await User.create({ name, email, password, role });
        sendTokenResponse(user, 201, res);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Login user
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide an email and password' });
        }
        const user = await User.findOne({ email }).select('+password').populate('entity');
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create a User (Super Admin only)
// @route   POST /api/users
// @access  Private/SuperAdmin
exports.createUser = async (req, res, next) => {
    try {
        const { name, email, password, role, mobileNo, area, duration, entityId, customLicenseDate } = req.body;

        if (!role) {
            return res.status(400).json({ success: false, error: 'Please provide a role' });
        }

        let userData = { name, email, password, mobileNo, area, role, entity: entityId };

        if (role === 'ADMIN') {
            if (!duration && !customLicenseDate) {
                return res.status(400).json({ success: false, error: 'Please provide a license duration in months for Admin role' });
            }

            const adminCount = await User.countDocuments({ role: 'ADMIN' });
            const serialNumber = (adminCount + 1).toString().padStart(3, '0');
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
            const licenseNumber = `${dateStr}-Admin-${serialNumber}@sunserk`;

            const licenseExpires = customLicenseDate
                ? new Date(customLicenseDate)
                : new Date(Date.now() + parseInt(duration) * 30 * 24 * 60 * 60 * 1000);

            userData.licenseNumber = licenseNumber;
            userData.licenseExpires = licenseExpires;
        }

        const user = await User.create(userData);

        // If entityId provided, add this user to the entity's admins list (if they are an admin)
        // Actually, maybe entities should have a list of all users? 
        // For now, I'll stick to the user's previous request where they wanted multiple admins in the entity.
        if (entityId) {
            const Entity = require('../../entities/models/Entity');
            await Entity.findByIdAndUpdate(entityId, {
                $push: { admins: user._id }
            });
        }

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create an Admin (Super Admin only) - Deprecated in favor of createUser
// @route   POST /api/users/create-admin
// @access  Private/SuperAdmin
exports.createAdmin = async (req, res, next) => {
    req.body.role = 'ADMIN';
    return exports.createUser(req, res, next);
};

// @desc    Toggle User Active Status (Super Admin only)
// @route   PUT /api/users/:id/toggle-status
// @access  Private/SuperAdmin
exports.toggleUserStatus = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('+password');

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update User (Super Admin only)
// @route   PUT /api/users/:id
// @access  Private/SuperAdmin
exports.updateUser = async (req, res, next) => {
    try {
        let user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        let fieldsToUpdate = { ...req.body };
        delete fieldsToUpdate._id;

        // If password is provided, hash it before saving
        if (fieldsToUpdate.password) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            fieldsToUpdate.password = await bcrypt.hash(fieldsToUpdate.password, salt);
        } else {
            delete fieldsToUpdate.password;
        }

        user = await User.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete User (Super Admin only)
// @route   DELETE /api/users/:id
// @access  Private/SuperAdmin
exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // If user is an admin linked to an entity, remove them from the entity's admins list
        if (user.entity) {
            const Entity = require('../../entities/models/Entity');
            await Entity.findByIdAndUpdate(user.entity, {
                $pull: { admins: user._id }
            });
        }

        await user.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

const sendTokenResponse = (user, statusCode, res) => {
    const token = user.getSignedJwtToken();
    res.status(statusCode).json({ 
        success: true, 
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            entity: user.entity // This will now be the full object if populated
        }
    });
};
