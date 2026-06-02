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
app.use('/api/rawmaterials', require('./modules/rawmaterials/routes/rawMaterialRoutes'));
app.use('/api/foodrequests', require('./modules/stockrequests/routes/stockRequestRoutes'));
app.use('/api/vendors', require('./modules/vendors/routes/vendorRoutes'));
app.use('/api/employees', require('./modules/employees/routes/employeeRoutes'));
app.use('/api/banks', require('./modules/banks/routes/bankRoutes'));
app.use('/api/events', require('./modules/events/routes/eventRoutes'));
app.use('/api/expense-categories', require('./modules/expenses/routes/expenseCategoryRoutes'));
app.use('/api/expenses', require('./modules/expenses/routes/expenseRoutes'));
app.use('/api/purchases', require('./modules/purchases/routes/purchaseRoutes'));
app.use('/api/wastage', require('./modules/wastage/routes/wastageRoutes'));
app.use('/api/finance', require('./modules/finance/routes/financeRoutes'));
app.use('/api/inventory', require('./modules/inventory/routes/inventoryRoutes'));
app.use('/api/production', require('./modules/production/routes/productionRoutes'));
app.use('/api/revenue', require('./modules/revenue/routes/revenueRoutes'));
app.use('/api/function-orders', require('./modules/functionorders/routes/functionOrderRoutes'));


// Seed Super Admin if not exists (reads credentials from .env)
// HR and all other users should be created through the Admin UI, not seeded here.
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
            console.log(`Super Admin created: ${process.env.SUPER_ADMIN_EMAIL}`);
        }
        // L5 Fix: HR seed with hardcoded password removed.
        // Create HR users via Admin UI \u2014 same flow as Kitchen, Center, Restaurant etc.
    } catch (err) {
        console.error('Error seeding users:', err.message);
    }
};

const { errorHandler } = require('./middleware/errorHandler');

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    await seedSuperAdmin();
});
