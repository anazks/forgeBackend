const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

const cors = require('cors');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Enable CORS
app.use(cors());

// Body parser
app.use(express.json());

// Mount routers
app.use('/api/users', require('./modules/users/routes/userRoutes'));
app.use('/api/payments', require('./modules/payments/routes/paymentRoutes'));
app.use('/api/entities', require('./modules/entities/routes/entityRoutes'));
app.use('/api/menus', require('./modules/menus/routes/menuRoutes'));
app.use('/api/boms', require('./modules/boms/routes/bomRoutes'));

// Seed Super Admin if not exists
const User = require('./modules/users/models/model');
const seedSuperAdmin = async () => {
    try {
        const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
        if (!superAdmin) {
            await User.create({
                name: 'Super Admin',
                email: process.env.SUPER_ADMIN_EMAIL,
                password: process.env.SUPER_ADMIN_PASSWORD,
                role: 'SUPER_ADMIN'
            });
            console.log(`Sample Super Admin created: ${process.env.SUPER_ADMIN_EMAIL}`);
        }
    } catch (err) {
        console.error('Error seeding super admin:', err.message);
    }
};

app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    await seedSuperAdmin();
});
