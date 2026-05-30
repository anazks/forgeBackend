const Entity = require('../models/Entity');
const User = require('../../users/models/model');


// @desc    Create an Entity
// @route   POST /api/entities
// @access  Private/SuperAdmin
exports.createEntity = async (req, res, next) => {
    try {
        const { username, name, location } = req.body;

        const entity = await Entity.create({
            username,
            name,
            location
        });

        res.status(201).json({
            success: true,
            data: entity
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all Entities
// @route   GET /api/entities
// @access  Private/SuperAdmin
exports.getEntities = async (req, res, next) => {
    try {
        const entities = await Entity.find().populate('admins', 'name email');

        res.status(200).json({
            success: true,
            count: entities.length,
            data: entities
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all Admins under a specific Entity
// @route   GET /api/entities/:id/admins
// @access  Private/SuperAdmin
exports.getAdminsByEntity = async (req, res, next) => {
    try {
        await User.checkExpiries(); // Automatic inactivate expired licenses
        const entity = await Entity.findById(req.params.id).populate('admins');

        if (!entity) {
            return res.status(404).json({ success: false, error: 'Entity not found' });
        }

        res.status(200).json({
            success: true,
            count: entity.admins.length,
            data: entity.admins
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create an Entity and its first Admin
// @route   POST /api/entities/create-with-admin
// @access  Private/SuperAdmin
exports.createEntityWithAdmin = async (req, res, next) => {
    try {
        const { entityUsername, entityName, location, name, email, password, mobileNo, area, duration, customLicenseDate } = req.body;

        // 1. Create Entity
        const entity = await Entity.create({
            username: entityUsername,
            name: entityName,
            location
        });

        // 2. Prepare Admin details
        if (!duration && !customLicenseDate) {
            return res.status(400).json({ success: false, error: 'Please provide a license duration in months' });
        }

        const adminCount = await User.countDocuments({ role: 'ADMIN' });
        const serialNumber = (adminCount + 1).toString().padStart(3, '0');

        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const licenseNumber = `${dateStr}-Admin-${serialNumber}@sunserk`;

        const licenseExpires = customLicenseDate
            ? new Date(customLicenseDate)
            : new Date(Date.now() + parseInt(duration) * 30 * 24 * 60 * 60 * 1000);

        // 3. Create Admin and link to Entity
        const user = await User.create({
            name,
            email,
            password,
            mobileNo,
            area,
            role: 'ADMIN',
            licenseNumber,
            licenseExpires,
            entity: entity._id
        });

        // 4. Update Entity with Admin ID
        entity.admins.push(user._id);
        await entity.save();

        res.status(201).json({
            success: true,
            data: {
                entity,
                admin: user
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Add another Admin to an existing Entity
// @route   POST /api/entities/:id/add-admin
// @access  Private/SuperAdmin
exports.addAdminToEntity = async (req, res, next) => {
    try {
        const { name, email, password, mobileNo, area, duration, role, customLicenseDate } = req.body;
        const entityId = req.params.id;

        const entity = await Entity.findById(entityId);
        if (!entity) {
            return res.status(404).json({ success: false, error: 'Entity not found' });
        }

        if (!duration && !customLicenseDate) {
            return res.status(400).json({ success: false, error: 'Please provide a license duration in months' });
        }

        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const entityCode = entity.username.toUpperCase();
        const userRole = role || 'ADMIN';
        const licenseNumber = `FRG-${entityCode}-${userRole}-${dateStr}-${randomStr}`;

        const licenseExpires = customLicenseDate
            ? new Date(customLicenseDate)
            : new Date(Date.now() + parseInt(duration) * 30 * 24 * 60 * 60 * 1000);

        const user = await User.create({
            name,
            email,
            password,
            mobileNo,
            area,
            role: userRole,
            licenseNumber,
            licenseExpires,
            entity: entity._id
        });

        entity.admins.push(user._id);
        await entity.save();

        res.status(201).json({
            success: true,
            data: {
                entity,
                admin: user
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update Entity details
// @route   PUT /api/entities/:id
// @access  Private/SuperAdmin
exports.updateEntity = async (req, res) => {
    try {
        const { name, location, username } = req.body;
        const entity = await Entity.findByIdAndUpdate(
            req.params.id,
            { name, location, username },
            { new: true, runValidators: true }
        );
        if (!entity) return res.status(404).json({ success: false, error: 'Entity not found' });
        res.status(200).json({ success: true, data: entity });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get users with license expiring in next 6 months
// @route   GET /api/entities/upcoming-renewals
// @access  Private/SuperAdmin
exports.getUpcomingRenewals = async (req, res) => {
    try {
        const now = new Date();
        const sixMonthsLater = new Date();
        sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
        const users = await User.find({
            licenseExpires: { $gte: now, $lte: sixMonthsLater },
            isActive: true
        }).populate('entity', 'name username').sort({ licenseExpires: 1 });
        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
