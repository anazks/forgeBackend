const jwt = require('jsonwebtoken');
const User = require('../modules/users/models/model');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        // Set token from Bearer token in header
        token = req.headers.authorization.split(' ')[1];
    }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id);

        // Check if account is active
        if (req.user.isActive === false) {
            return res.status(403).json({ success: false, error: 'Your account is inactive. Please contact Super Admin.' });
        }

        // Check if license is expired (for Admin role)
        if (req.user.role === 'ADMIN' && req.user.licenseExpires && req.user.licenseExpires < new Date()) {
            return res.status(403).json({ success: false, error: 'Your license has expired. Please contact Super Admin.' });
        }

        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};
