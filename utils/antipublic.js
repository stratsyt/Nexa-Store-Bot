const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dbDir = path.join(__dirname, '..', 'databases');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('[ANTIPUBLIC] Created databases directory');
}
const dbPath = path.join(dbDir, 'antipublic.db');
console.log(`[ANTIPUBLIC] Initializing database at: ${dbPath}`);
const antipublicDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('[ANTIPUBLIC] Error opening database:', err.message);
    } else {
        console.log('[ANTIPUBLIC] Database connection established');
    }
});
antipublicDb.serialize(() => {
    antipublicDb.run(`CREATE TABLE IF NOT EXISTS delivered_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        minecraft_username TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        account_data TEXT NOT NULL
    )`, (err) => {
        if (err) {
            console.error('[ANTIPUBLIC] Error creating table:', err.message);
        } else {
            console.log('[ANTIPUBLIC] Table "delivered_accounts" ready');
        }
    });
});
function extractMinecraftUsername(accountData) {
    try {
        console.log(`[ANTIPUBLIC] Extracting username from: ${accountData.substring(0, 50)}...`);
        if (accountData.includes(' | accesstoken:')) {
            console.log('[ANTIPUBLIC] Detected token format');
            const parts = accountData.split(' - ');
            console.log(`[ANTIPUBLIC] Token format parts: ${parts.length}`);
            if (parts.length >= 5) {
                const usernameSegment = parts[4].split(' | ')[0].trim(); 
                console.log(`[ANTIPUBLIC] Username segment: ${usernameSegment}`);
                if (usernameSegment.startsWith('[') && usernameSegment.endsWith(']')) {
                    const username = usernameSegment.slice(1, -1);
                    console.log(`[ANTIPUBLIC] Extracted username from token format: ${username}`);
                    return username;
                }
            }
        }
        const parts = accountData.split(':');
        console.log(`[ANTIPUBLIC] Regular format parts: ${parts.length}`);
        if (parts.length >= 3) {
            const lastPart = parts[parts.length - 1].trim();
            if (lastPart && !lastPart.includes('@') && !lastPart.includes('.')) {
                console.log(`[ANTIPUBLIC] Extracted username from 3-part format: ${lastPart}`);
                return lastPart;
            }
        }
        if (parts.length >= 2) {
            const firstPart = parts[0].trim();
            if (firstPart && !firstPart.includes('@') && !firstPart.includes('.')) {
                console.log(`[ANTIPUBLIC] Extracted username from 2-part format: ${firstPart}`);
                return firstPart;
            }
        }
        console.log('[ANTIPUBLIC] No username could be extracted');
        return null;
    } catch (error) {
        console.error('Error extracting Minecraft username:', error);
        return null;
    }
}
function isUsernameDelivered(username) {
    return new Promise((resolve, reject) => {
        if (!username) {
            resolve(false);
            return;
        }
        antipublicDb.get(
            'SELECT * FROM delivered_accounts WHERE LOWER(minecraft_username) = LOWER(?)',
            [username],
            (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
}
function getUsernameDeliveryInfo(username) {
    return new Promise((resolve, reject) => {
        if (!username) {
            console.log('[ANTIPUBLIC] getUsernameDeliveryInfo: No username provided');
            resolve(null);
            return;
        }
        console.log(`[ANTIPUBLIC] Querying database for username: ${username}`);
        antipublicDb.get(
            'SELECT * FROM delivered_accounts WHERE LOWER(minecraft_username) = LOWER(?)',
            [username],
            (err, row) => {
                if (err) {
                    console.error(`[ANTIPUBLIC] Database query error:`, err);
                    reject(err);
                } else {
                    console.log(`[ANTIPUBLIC] Query result for ${username}:`, row ? 'Found' : 'Not found');
                    if (row) {
                        console.log(`[ANTIPUBLIC] Found record: ID=${row.id}, User=${row.user_id}, Order=${row.order_id}`);
                    }
                    resolve(row);
                }
            }
        );
    });
}
function recordDeliveredAccount(username, userId, orderId, productName, accountData) {
    return new Promise((resolve, reject) => {
        if (!username) {
            console.log('[ANTIPUBLIC] recordDeliveredAccount: No username provided, skipping');
            resolve(null);
            return;
        }
        console.log(`[ANTIPUBLIC] Recording delivery: ${username} for user ${userId} in order ${orderId}`);
        const stmt = antipublicDb.prepare(`
            INSERT OR REPLACE INTO delivered_accounts 
            (minecraft_username, user_id, order_id, product_name, delivered_at, account_data) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            username,
            userId,
            orderId,
            productName,
            new Date().toISOString(),
            accountData,
            function(err) {
                if (err) {
                    console.error(`[ANTIPUBLIC] Error recording ${username}:`, err);
                    reject(err);
                } else {
                    console.log(`[ANTIPUBLIC] Successfully recorded ${username} (row ID: ${this.lastID})`);
                    resolve(this);
                }
            }
        );
        stmt.finalize();
    });
}
async function filterDeliveredAccounts(accounts) {
    const filteredAccounts = [];
    const alreadyDelivered = [];
    for (const account of accounts) {
        const username = extractMinecraftUsername(account.content);
        if (!username) {
            filteredAccounts.push(account);
            continue;
        }
        const isDelivered = await isUsernameDelivered(username);
        if (isDelivered) {
            alreadyDelivered.push({
                account: account,
                username: username
            });
        } else {
            filteredAccounts.push(account);
        }
    }
    return {
        filtered: filteredAccounts,
        alreadyDelivered: alreadyDelivered
    };
}
async function recordMultipleDeliveredAccounts(accounts, userId, orderId, productName) {
    const recordedUsernames = [];
    for (const account of accounts) {
        const username = extractMinecraftUsername(account.content);
        if (username) {
            try {
                await recordDeliveredAccount(username, userId, orderId, productName, account.content);
                recordedUsernames.push(username);
            } catch (error) {
                console.error(`Error recording username ${username}:`, error);
            }
        }
    }
    return recordedUsernames;
}
function getUserDeliveredAccounts(userId) {
    return new Promise((resolve, reject) => {
        antipublicDb.all(
            'SELECT * FROM delivered_accounts WHERE user_id = ? ORDER BY delivered_at DESC',
            [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}
function getDeliveryStats() {
    return new Promise((resolve, reject) => {
        antipublicDb.get(
            `SELECT 
                COUNT(*) as total_delivered,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT product_name) as products_delivered
            FROM delivered_accounts`,
            [],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        console.log('[ANTIPUBLIC] Manual database initialization requested');
        antipublicDb.serialize(() => {
            antipublicDb.run(`CREATE TABLE IF NOT EXISTS delivered_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                minecraft_username TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL,
                order_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                delivered_at TEXT NOT NULL,
                account_data TEXT NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('[ANTIPUBLIC] Manual init error:', err.message);
                    reject(err);
                } else {
                    console.log('[ANTIPUBLIC] Manual initialization completed');
                    resolve();
                }
            });
        });
    });
}
function testConnection() {
    return new Promise((resolve, reject) => {
        antipublicDb.get('SELECT 1 as test', [], (err, row) => {
            if (err) {
                console.error('[ANTIPUBLIC] Connection test failed:', err.message);
                reject(err);
            } else {
                console.log('[ANTIPUBLIC] Connection test successful');
                resolve(row);
            }
        });
    });
}
module.exports = {
    antipublicDb,
    extractMinecraftUsername,
    isUsernameDelivered,
    getUsernameDeliveryInfo,
    recordDeliveredAccount,
    filterDeliveredAccounts,
    recordMultipleDeliveredAccounts,
    getUserDeliveredAccounts,
    getDeliveryStats,
    initializeDatabase,
    testConnection
};