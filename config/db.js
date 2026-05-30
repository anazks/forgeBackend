const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Drop legacy non-partial indexes if present to let Mongoose recreate them correctly as partial indexes
        try {
            const db = mongoose.connection.db;
            const collections = await db.listCollections({ name: 'menurates' }).toArray();
            if (collections.length > 0) {
                const collection = db.collection('menurates');
                const indexes = await collection.indexes();
                for (const idx of indexes) {
                    if (idx.name === 'menu_1_center_1' && !idx.partialFilterExpression) {
                        console.log('Dropping legacy non-partial menu_1_center_1 index...');
                        await collection.dropIndex('menu_1_center_1');
                    }
                    if (idx.name === 'bom_1_center_1' && !idx.partialFilterExpression) {
                        console.log('Dropping legacy non-partial bom_1_center_1 index...');
                        await collection.dropIndex('bom_1_center_1');
                    }
                }
            }
        } catch (idxError) {
            console.warn('Index migration check failed:', idxError.message);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
