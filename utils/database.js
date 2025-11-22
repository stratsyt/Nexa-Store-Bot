const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dbDir = path.join(__dirname, '..', 'databases');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const storeDb = new sqlite3.Database(path.join(dbDir, 'store.db'));
const keysDb = new sqlite3.Database(path.join(dbDir, 'keys.db'));
const userDb = new sqlite3.Database(path.join(dbDir, 'user.db'));
const blacklistDb = new sqlite3.Database(path.join(dbDir, 'blacklisted.db'));
const depositsDb = new sqlite3.Database(path.join(dbDir, 'deposits.db'));
const ordersDb = new sqlite3.Database(path.join(dbDir, 'orders.db'));
const { antipublicDb } = require('./antipublic');
storeDb.serialize(() => {
    storeDb.run(`CREATE TABLE IF NOT EXISTS products (
        name TEXT PRIMARY KEY,
        price REAL NOT NULL,
        cooldown INTEGER NOT NULL,
        cookieMode INTEGER NOT NULL,
        stock INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        precheck_level INTEGER DEFAULT 0,
        precheck_type TEXT DEFAULT 'email:pass'
    )`);
});
keysDb.serialize(() => {
    keysDb.run(`CREATE TABLE IF NOT EXISTS keys (
        key_code TEXT PRIMARY KEY,
        coin_amount INTEGER NOT NULL,
        redeemed INTEGER DEFAULT 0,
        redeemed_by TEXT,
        created_at TEXT NOT NULL,
        redeemed_at TEXT
    )`);
});
userDb.serialize(() => {
    userDb.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        coins INTEGER DEFAULT 0
    )`);
});
blacklistDb.serialize(() => {
    blacklistDb.run(`CREATE TABLE IF NOT EXISTS blacklisted (
        user_id TEXT PRIMARY KEY,
        blacklisted_at TEXT NOT NULL,
        blacklisted_by TEXT NOT NULL
    )`);
});
depositsDb.serialize(() => {
    depositsDb.run(`CREATE TABLE IF NOT EXISTS deposits (
        invoice_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        coin_amount INTEGER NOT NULL,
        crypto_currency TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        completed_at TEXT
    )`);
});
ordersDb.serialize(() => {
    ordersDb.run(`CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        total_cost INTEGER NOT NULL,
        cookie_mode INTEGER NOT NULL,
        status TEXT DEFAULT 'processing',
        created_at TEXT NOT NULL,
        completed_at TEXT
    )`);
    ordersDb.run(`CREATE TABLE IF NOT EXISTS refunds (
        refund_id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        requested_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        proof_links TEXT,
        status TEXT DEFAULT 'pending',
        admin_response TEXT,
        approved_amount INTEGER,
        created_at TEXT NOT NULL,
        processed_at TEXT,
        processed_by TEXT
    )`);
    ordersDb.run(`CREATE TABLE IF NOT EXISTS user_cooldowns (
        user_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        last_purchase TEXT NOT NULL,
        PRIMARY KEY (user_id, product_name)
    )`);
});
function addProduct(name, price, cooldown, cookieMode, precheckLevel = 0, precheckType = 'email:pass') {
    return new Promise((resolve, reject) => {
        const stmt = storeDb.prepare('INSERT OR REPLACE INTO products (name, price, cooldown, cookieMode, stock, createdAt, precheck_level, precheck_type) VALUES (?, ?, ?, ?, 0, ?, ?, ?)');
        stmt.run(name, price, cooldown, cookieMode ? 1 : 0, new Date().toISOString(), precheckLevel, precheckType, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
        stmt.finalize();
    });
}
function removeProduct(name) {
    return new Promise((resolve, reject) => {
        storeDb.run('DELETE FROM products WHERE name = ?', [name], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function getProduct(name) {
    return new Promise((resolve, reject) => {
        storeDb.get('SELECT * FROM products WHERE name = ?', [name], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function getAllProducts() {
    return new Promise((resolve, reject) => {
        storeDb.all('SELECT * FROM products', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}
function updateStock(name, stock) {
    return new Promise((resolve, reject) => {
        storeDb.run('UPDATE products SET stock = ? WHERE name = ?', [stock, name], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function addKey(keyCode, coinAmount) {
    return new Promise((resolve, reject) => {
        const stmt = keysDb.prepare('INSERT INTO keys (key_code, coin_amount, created_at) VALUES (?, ?, ?)');
        stmt.run(keyCode, coinAmount, new Date().toISOString(), function(err) {
            if (err) reject(err);
            else resolve(this);
        });
        stmt.finalize();
    });
}
function getKey(keyCode) {
    return new Promise((resolve, reject) => {
        keysDb.get('SELECT * FROM keys WHERE key_code = ?', [keyCode], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function redeemKey(keyCode, userId) {
    return new Promise((resolve, reject) => {
        keysDb.run('UPDATE keys SET redeemed = 1, redeemed_by = ?, redeemed_at = ? WHERE key_code = ?', 
               [userId, new Date().toISOString(), keyCode], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function getUserCoins(userId) {
    return new Promise((resolve, reject) => {
        userDb.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function addCoins(userId, amount) {
    return new Promise((resolve, reject) => {
        userDb.run(`INSERT INTO users (id, coins) VALUES (?, ?) 
                ON CONFLICT(id) DO UPDATE SET coins = coins + ?`, 
               [userId, amount, amount], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function getAllKeys() {
    return new Promise((resolve, reject) => {
        keysDb.all('SELECT * FROM keys', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}
function getAllUsers() {
    return new Promise((resolve, reject) => {
        userDb.all('SELECT * FROM users', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}
function setCoins(userId, amount) {
    return new Promise((resolve, reject) => {
        userDb.run(`INSERT INTO users (id, coins) VALUES (?, ?) 
                ON CONFLICT(id) DO UPDATE SET coins = ?`, 
               [userId, amount, amount], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function removeCoins(userId, amount) {
    return new Promise((resolve, reject) => {
        userDb.run(`INSERT INTO users (id, coins) VALUES (?, 0) 
                ON CONFLICT(id) DO UPDATE SET coins = MAX(0, coins - ?)`, 
               [userId, amount], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function addToBlacklist(userId, blacklistedBy) {
    return new Promise((resolve, reject) => {
        const stmt = blacklistDb.prepare('INSERT OR REPLACE INTO blacklisted (user_id, blacklisted_at, blacklisted_by) VALUES (?, ?, ?)');
        stmt.run(userId, new Date().toISOString(), blacklistedBy, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
        stmt.finalize();
    });
}
function removeFromBlacklist(userId) {
    return new Promise((resolve, reject) => {
        blacklistDb.run('DELETE FROM blacklisted WHERE user_id = ?', [userId], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function isBlacklisted(userId) {
    return new Promise((resolve, reject) => {
        blacklistDb.get('SELECT * FROM blacklisted WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}
function getAllBlacklisted() {
    return new Promise((resolve, reject) => {
        blacklistDb.all('SELECT * FROM blacklisted', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}
function addDeposit(invoiceId, userId, coinAmount, cryptoCurrency, amountUsd) {
    return new Promise((resolve, reject) => {
        const stmt = depositsDb.prepare('INSERT INTO deposits (invoice_id, user_id, coin_amount, crypto_currency, amount_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(invoiceId, userId, coinAmount, cryptoCurrency, amountUsd, new Date().toISOString(), function(err) {
            if (err) reject(err);
            else resolve(this);
        });
        stmt.finalize();
    });
}
function getDeposit(invoiceId) {
    return new Promise((resolve, reject) => {
        depositsDb.get('SELECT * FROM deposits WHERE invoice_id = ?', [invoiceId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function updateDepositStatus(invoiceId, status) {
    return new Promise((resolve, reject) => {
        const completedAt = status === 'completed' ? new Date().toISOString() : null;
        depositsDb.run('UPDATE deposits SET status = ?, completed_at = ? WHERE invoice_id = ?', 
                      [status, completedAt, invoiceId], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function addOrder(orderId, userId, productName, quantity, totalCost, cookieMode) {
    return new Promise((resolve, reject) => {
        const stmt = ordersDb.prepare('INSERT INTO orders (order_id, user_id, product_name, quantity, total_cost, cookie_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        stmt.run(orderId, userId, productName, quantity, totalCost, cookieMode ? 1 : 0, new Date().toISOString(), function(err) {
            if (err) reject(err);
            else resolve(this);
        });
        stmt.finalize();
    });
}
function getOrder(orderId) {
    return new Promise((resolve, reject) => {
        ordersDb.get('SELECT * FROM orders WHERE order_id = ?', [orderId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function updateOrderStatus(orderId, status) {
    return new Promise((resolve, reject) => {
        const completedAt = status === 'completed' ? new Date().toISOString() : null;
        ordersDb.run('UPDATE orders SET status = ?, completed_at = ? WHERE order_id = ?', 
                      [status, completedAt, orderId], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function addRefund(refundId, orderId, userId, requestedAmount, reason, proofLinks) {
    return new Promise((resolve, reject) => {
        const stmt = ordersDb.prepare('INSERT INTO refunds (refund_id, order_id, user_id, requested_amount, reason, proof_links, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        stmt.run(refundId, orderId, userId, requestedAmount, reason, proofLinks, new Date().toISOString(), function(err) {
            if (err) reject(err);
            else resolve(this);
        });
        stmt.finalize();
    });
}
function getRefund(refundId) {
    return new Promise((resolve, reject) => {
        ordersDb.get('SELECT * FROM refunds WHERE refund_id = ?', [refundId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function updateRefundStatus(refundId, status, adminResponse, approvedAmount, processedBy) {
    return new Promise((resolve, reject) => {
        ordersDb.run('UPDATE refunds SET status = ?, admin_response = ?, approved_amount = ?, processed_at = ?, processed_by = ? WHERE refund_id = ?', 
                      [status, adminResponse, approvedAmount, new Date().toISOString(), processedBy, refundId], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function updateProduct(name, updates) {
    return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        values.push(name); 
        const sql = `UPDATE products SET ${fields.join(', ')} WHERE name = ?`;
        const stmt = storeDb.prepare(sql);
        stmt.run(values, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function setCooldown(userId, productName) {
    return new Promise((resolve, reject) => {
        ordersDb.run(`INSERT OR REPLACE INTO user_cooldowns (user_id, product_name, last_purchase) VALUES (?, ?, ?)`,
               [userId, productName, new Date().toISOString()], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function getCooldown(userId, productName) {
    return new Promise((resolve, reject) => {
        ordersDb.get(`SELECT * FROM user_cooldowns WHERE user_id = ? AND product_name = ?`,
               [userId, productName], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}
function clearUserCooldowns(userId) {
    return new Promise((resolve, reject) => {
        ordersDb.run(`DELETE FROM user_cooldowns WHERE user_id = ?`, [userId], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function clearAllCooldowns() {
    return new Promise((resolve, reject) => {
        ordersDb.run(`DELETE FROM user_cooldowns`, [], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}
function getAllCooldowns() {
    return new Promise((resolve, reject) => {
        ordersDb.all(`SELECT * FROM user_cooldowns`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}
function getActualStockCount(productName, cookieMode) {
    const fs = require('fs');
    const path = require('path');
    try {
        const stockDir = path.join(__dirname, '..', 'stock');
        if (cookieMode) {
            const productDir = path.join(stockDir, productName);
            if (!fs.existsSync(productDir)) {
                return 0;
            }
            const files = fs.readdirSync(productDir).filter(f => {
                const filePath = path.join(productDir, f);
                return fs.statSync(filePath).isFile();
            });
            return files.length;
        } else {
            const stockFile = path.join(stockDir, `${productName}.txt`);
            if (!fs.existsSync(stockFile)) {
                return 0;
            }
            const content = fs.readFileSync(stockFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            return lines.length;
        }
    } catch (error) {
        console.error(`Error counting stock for ${productName}:`, error);
        return 0;
    }
}
function syncAllProductStock() {
    return new Promise(async (resolve, reject) => {
        try {
            const products = await getAllProducts();
            const syncResults = [];
            for (const product of products) {
                const actualStock = getActualStockCount(product.name, product.cookieMode);
                const dbStock = product.stock || 0;
                if (actualStock !== dbStock) {
                    await updateStock(product.name, actualStock);
                    syncResults.push({
                        name: product.name,
                        oldStock: dbStock,
                        newStock: actualStock,
                        difference: actualStock - dbStock
                    });
                }
            }
            resolve(syncResults);
        } catch (error) {
            reject(error);
        }
    });
}
module.exports = {
    storeDb,
    keysDb,
    userDb,
    blacklistDb,
    depositsDb,
    ordersDb,
    antipublicDb,
    addProduct,
    removeProduct,
    getProduct,
    getAllProducts,
    updateProduct,
    updateStock,
    addKey,
    getKey,
    redeemKey,
    getUserCoins,
    addCoins,
    getAllKeys,
    getAllUsers,
    setCoins,
    removeCoins,
    addToBlacklist,
    removeFromBlacklist,
    isBlacklisted,
    getAllBlacklisted,
    addDeposit,
    getDeposit,
    updateDepositStatus,
    addOrder,
    getOrder,
    updateOrderStatus,
    addRefund,
    getRefund,
    updateRefundStatus,
    setCooldown,
    getCooldown,
    clearUserCooldowns,
    clearAllCooldowns,
    getAllCooldowns,
    getActualStockCount,
    syncAllProductStock
};