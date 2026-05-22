const User = require('../models/model');

class UserService {
    async getUserById(userId) {
        return await User.findById(userId).lean();
    }

    async isRestaurant(userId) {
        const user = await User.findById(userId).select('role').lean();
        return user ? user.role === 'RESTAURANT' : false;
    }
}

module.exports = new UserService();
