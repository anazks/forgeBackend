const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const generateToken = () => {
    const payload = { id: 'sample_super_admin_id' }; // In reality, this would be the Mongo ID
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
    console.log('Sample Token for Super Admin:');
    console.log(token);
};

generateToken();
