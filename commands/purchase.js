const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { checkBlacklist } = require('../utils/blacklist');
const { getAllProducts, getProduct, getUserCoins, removeCoins, addOrder, updateOrderStatus, updateStock, getCooldown, setCooldown } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const { logPurchase, logBalanceChange } = require('../utils/logging');
const { filterDeliveredAccounts, recordMultipleDeliveredAccounts } = require('../utils/antipublic');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
function generateOrderId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'ORDER-';
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 2) result += '-';
    }
    return result;
}
const orderQueue = new Map(); 
const QUEUE_PROCESS_DELAY = 1000; 
function queueOrder(orderId, userId, productName, quantity, client) {
    if (!orderQueue.has(productName)) {
        orderQueue.set(productName, { orders: [], processing: false });
    }
    const queue = orderQueue.get(productName);
    queue.orders.push({ orderId, userId, quantity, client });
    console.log(`[ORDER QUEUE] Added order ${orderId} to queue for ${productName} (Queue size: ${queue.orders.length})`);
    if (!queue.processing) {
        setTimeout(() => {
            processBatchOrders(productName);
        }, QUEUE_PROCESS_DELAY);
    }
}
async function processBatchOrders(productName) {
    const queue = orderQueue.get(productName);
    if (!queue || queue.orders.length === 0) {
        return;
    }
    if (queue.processing) {
        console.log(`[ORDER QUEUE] ${productName} is already being processed, skipping...`);
        return;
    }
    queue.processing = true;
    const orders = [...queue.orders]; 
    queue.orders = []; 
    console.log(`[BATCH PROCESS] Starting batch processing for ${productName} - ${orders.length} orders queued`);
    try {
        const totalNeeded = orders.reduce((sum, order) => sum + order.quantity, 0);
        console.log(`[BATCH PROCESS] Total accounts needed: ${totalNeeded} for ${orders.length} orders`);
        await processBatchedOrders(productName, orders, totalNeeded);
    } catch (error) {
        console.error(`[BATCH PROCESS] Error processing batch for ${productName}:`, error);
        for (const order of orders) {
            await updateOrderStatus(order.orderId, 'failed');
            try {
                const user = await order.client.users.fetch(order.userId);
                const embed = new EmbedBuilder()
                    .setTitle('❌ Purchase Failed')
                    .setDescription(`An error occurred while processing your order.\n\nOrder ID: ${order.orderId}`)
                    .setColor(0xFF0000)
                    .setTimestamp();
                await user.send({ embeds: [embed] });
            } catch (dmError) {
                console.log(`Could not send DM to user ${order.userId}: ${dmError.message}`);
            }
        }
    } finally {
        queue.processing = false;
        if (queue.orders.length > 0) {
            console.log(`[ORDER QUEUE] More orders added during processing, scheduling next batch...`);
            setTimeout(() => {
                processBatchOrders(productName);
            }, QUEUE_PROCESS_DELAY);
        }
    }
}
async function processBatchedOrders(productName, orders, totalNeeded) {
    console.log(`[BATCH PROCESS] Processing ${orders.length} orders for ${productName} (need ${totalNeeded} accounts)`);
    try {
        const product = await getProduct(productName);
        if (!product) {
            throw new Error(`Product ${productName} not found`);
        }
        const stockDir = path.join(__dirname, '..', 'stock');
        let allStockItems = [];
        if (product.cookieMode) {
            const productDir = path.join(stockDir, productName);
            if (fs.existsSync(productDir)) {
                const files = fs.readdirSync(productDir).filter(f => {
                    const filePath = path.join(productDir, f);
                    return fs.statSync(filePath).isFile();
                });
                for (const file of files) {
                    const filePath = path.join(productDir, file);
                    const content = fs.readFileSync(filePath, 'utf8');
                    allStockItems.push({
                        filename: file,
                        content: content.trim(),
                        filePath: filePath
                    });
                }
            }
        } else {
            const stockFile = path.join(stockDir, `${productName}.txt`);
            if (fs.existsSync(stockFile)) {
                const content = fs.readFileSync(stockFile, 'utf8');
                const lines = content.split('\n').filter(line => line.trim() !== '');
                allStockItems = lines.map((line, index) => ({
                    content: line.trim(),
                    lineIndex: index
                }));
            }
        }
        console.log(`[BATCH PROCESS] Loaded ${allStockItems.length} stock items for ${productName}`);
        let validItems = [];
        let invalidItems = [];
        if (product.precheck_level > 0 && allStockItems.length > 0) {
            console.log(`[BATCH PRECHECK] Running batch precheck on ${allStockItems.length} accounts (Level ${product.precheck_level})`);
            const PrecheckAPI = require('../utils/precheck-api');
            const precheck = new PrecheckAPI(product);
            const apiHealthy = await precheck.checkAPIHealth();
            if (!apiHealthy) {
                console.log(`❌ Batch Failed: Precheck API is not available for ${productName}`);
                for (const order of orders) {
                    await updateOrderStatus(order.orderId, 'failed');
                    const totalCost = product.price * order.quantity;
                    await logPurchase(order.orderId, order.userId, productName, order.quantity, totalCost, 'failed - API unavailable');
                    try {
                        const user = await order.client.users.fetch(order.userId);
                        const embed = new EmbedBuilder()
                            .setTitle('❌ Purchase Failed')
                            .setDescription(`Precheck API is not available for **${productName}**.\n\nThe API server needs to be running for account validation.\n\nOrder ID: ${order.orderId}`)
                            .addFields({ name: '💡 Solution', value: 'Contact support - API server needs to be started' })
                            .setColor(0xFF0000)
                            .setTimestamp();
                        await user.send({ embeds: [embed] });
                    } catch (dmError) {
                        console.log(`Could not send DM to user ${order.userId}: ${dmError.message}`);
                    }
                }
                return;
            }
            console.log(`[BATCH PRECHECK] Starting batch validation of ${allStockItems.length} accounts...`);
            const accountDataList = allStockItems.map(item => item.content);
            const config = require('../config.json');
            const threads = config.precheck?.threads || 10;
            const batchResults = await precheck.precheckBatch(accountDataList, {
                concurrency: threads,
                requiredQuantity: null 
            });
            console.log(`[BATCH PRECHECK] Batch complete: ${batchResults.valid}/${batchResults.processed} valid accounts`);
            for (let i = 0; i < allStockItems.length && i < batchResults.results.length; i++) {
                const result = batchResults.results[i];
                const stockItem = allStockItems[i];
                if (result.valid) {
                    validItems.push(stockItem);
                } else {
                    invalidItems.push(stockItem);
                }
            }
            if (invalidItems.length > 0) {
                console.log(`[BATCH PRECHECK] Removing ${invalidItems.length} invalid accounts from stock`);
                if (product.cookieMode) {
                    for (const item of invalidItems) {
                        if (fs.existsSync(item.filePath)) {
                            fs.unlinkSync(item.filePath);
                        }
                    }
                } else {
                    const stockFile = path.join(stockDir, `${productName}.txt`);
                    const validContent = validItems.map(item => item.content).join('\n');
                    fs.writeFileSync(stockFile, validContent + (validContent ? '\n' : ''));
                }
            }
        } else {
            console.log(`[BATCH PROCESS] No precheck enabled, using all ${allStockItems.length} items`);
            validItems = allStockItems;
        }
        console.log(`[BATCH ANTIPUBLIC] Filtering ${validItems.length} accounts for duplicate usernames...`);
        const antipublicResult = await filterDeliveredAccounts(validItems);
        if (antipublicResult.alreadyDelivered.length > 0) {
            console.log(`[BATCH ANTIPUBLIC] Found ${antipublicResult.alreadyDelivered.length} already delivered accounts`);
            if (product.cookieMode) {
                for (const delivered of antipublicResult.alreadyDelivered) {
                    if (delivered.account.filePath && fs.existsSync(delivered.account.filePath)) {
                        fs.unlinkSync(delivered.account.filePath);
                    }
                }
            } else {
                const stockFile = path.join(stockDir, `${productName}.txt`);
                const remainingContent = antipublicResult.filtered.map(item => item.content).join('\n');
                fs.writeFileSync(stockFile, remainingContent + (remainingContent ? '\n' : ''));
            }
        }
        validItems = antipublicResult.filtered;
        console.log(`[BATCH ANTIPUBLIC] After filtering: ${validItems.length} unique accounts available`);
        let accountIndex = 0;
        const orderResults = [];
        const remainingStockItems = []; 
        for (const order of orders) {
            const accountsForOrder = [];
            const needed = order.quantity;
            for (let i = 0; i < needed && accountIndex < validItems.length; i++) {
                accountsForOrder.push(validItems[accountIndex]);
                accountIndex++;
            }
            orderResults.push({
                order: order,
                accounts: accountsForOrder
            });
        }
        if (!product.cookieMode && accountIndex < validItems.length) {
            remainingStockItems.push(...validItems.slice(accountIndex));
        }
        for (const result of orderResults) {
            await deliverOrder(result.order, result.accounts, product, validItems.length, invalidItems.length);
        }
        if (!product.cookieMode) {
            const stockFile = path.join(stockDir, `${productName}.txt`);
            const remainingContent = remainingStockItems.map(item => item.content).join('\n');
            fs.writeFileSync(stockFile, remainingContent + (remainingContent ? '\n' : ''));
            console.log(`[BATCH PROCESS] Updated stock file with ${remainingStockItems.length} remaining accounts`);
        }
        const { getActualStockCount } = require('../utils/database');
        const actualStock = getActualStockCount(productName, product.cookieMode);
        await updateStock(productName, actualStock);
        console.log(`[BATCH PROCESS] Completed processing ${orders.length} orders for ${productName}`);
    } catch (error) {
        console.error(`[BATCH PROCESS] Error in processBatchedOrders:`, error);
        throw error;
    }
}
async function deliverOrder(order, deliveredItems, product, totalValid, totalInvalid) {
    const { orderId, userId, quantity, client } = order;
    if (deliveredItems.length === 0) {
        console.log(`❌ Order ${orderId}: No valid accounts available`);
        await updateOrderStatus(orderId, 'failed');
        const totalCost = product.price * quantity;
        await logPurchase(orderId, userId, product.name, quantity, totalCost, 'failed - no valid accounts');
        try {
            const user = await client.users.fetch(userId);
            const embed = new EmbedBuilder()
                .setTitle('❌ Purchase Failed')
                .setDescription(`No valid accounts available for **${product.name}**.\n\nOrder ID: ${orderId}`)
                .setColor(0xFF0000)
                .setTimestamp();
            await user.send({ embeds: [embed] });
        } catch (dmError) {
            console.log(`Could not send DM to user ${userId}: ${dmError.message}`);
        }
        return;
    }
    await updateOrderStatus(orderId, 'completed');
    const stockDir = path.join(__dirname, '..', 'stock');
    if (product.cookieMode) {
        deliveredItems.forEach(item => {
            if (fs.existsSync(item.filePath)) {
                fs.unlinkSync(item.filePath);
            }
        });
    } else {
    }
    const recordedUsernames = await recordMultipleDeliveredAccounts(deliveredItems, userId, orderId, product.name);
    const user = await client.users.fetch(userId);
    const ordersDir = path.join(__dirname, '..', 'orders');
    if (!fs.existsSync(ordersDir)) {
        fs.mkdirSync(ordersDir, { recursive: true });
    }
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    let attachment;
    if (product.cookieMode) {
        const orderDir = path.join(ordersDir, orderId);
        if (!fs.existsSync(orderDir)) {
            fs.mkdirSync(orderDir, { recursive: true });
        }
        deliveredItems.forEach((item) => {
            const filePath = path.join(orderDir, item.filename);
            fs.writeFileSync(filePath, item.content);
        });
        const zip = new AdmZip();
        deliveredItems.forEach((item) => {
            zip.addFile(item.filename, Buffer.from(item.content, 'utf8'));
        });
        const zipPath = path.join(tempDir, `${orderId}.zip`);
        zip.writeZip(zipPath);
        attachment = new AttachmentBuilder(zipPath, { name: `${orderId}.zip` });
        setTimeout(() => {
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }
        }, 30000);
    } else {
        const txtContent = deliveredItems.map(item => item.content).join('\n');
        const orderFilePath = path.join(ordersDir, `${orderId}.txt`);
        fs.writeFileSync(orderFilePath, txtContent);
        const txtPath = path.join(tempDir, `${orderId}.txt`);
        fs.writeFileSync(txtPath, txtContent);
        attachment = new AttachmentBuilder(txtPath, { name: `${orderId}.txt` });
        setTimeout(() => {
            if (fs.existsSync(txtPath)) {
                fs.unlinkSync(txtPath);
            }
        }, 30000);
    }
    const isPartialDelivery = deliveredItems.length < quantity;
    const deliveryType = isPartialDelivery ? '⚠️ Partial Delivery' : 'Order Summary';
    let description = `・Order: \`#${orderId}\`\n・Product: \`${product.name}\`\n・Amount: \`${deliveredItems.length}\``;
    if (isPartialDelivery) {
        description += `\n・Requested: \`${quantity}\`\n・**Note:** Only ${deliveredItems.length} valid accounts were available`;
        if (product.precheck_level > 0) {
            description += `\n・**Precheck:** ${totalValid} valid, ${totalInvalid} invalid accounts removed from stock`;
        }
    }
    description += `\n\n# What to do if the accounts dont work?\nDo \`/replace ${orderId} ${deliveredItems.length}\`, then provide evidence that the account does not work **(Replacements are only accepted within 2hrs of the purchase)**`;
    const completionEmbed = new EmbedBuilder()
        .setTitle(deliveryType)
        .setDescription(description)
        .setColor(isPartialDelivery ? 0xffa500 : getRandomColor())
        .setFooter({ text: `#${orderId}` });
    await user.send({
        embeds: [completionEmbed],
        files: [attachment]
    });
    try {
        const config = require('../config.json');
        if (config.customerRole && config.customerRole !== 'your_customer_role_id_here') {
            const guild = client.guilds.cache.first();
            if (guild) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member && !member.roles.cache.has(config.customerRole)) {
                    await member.roles.add(config.customerRole);
                }
            }
        }
    } catch (roleError) {
        console.log(`⚠️ Could not add customer role to user ${userId}: ${roleError.message}`);
    }
    console.log(`Order ${orderId} completed - delivered ${deliveredItems.length}/${quantity} items to user ${userId}`);
    const totalCost = product.price * quantity;
    const antipublicInfo = recordedUsernames.length > 0 ? ` (Usernames: ${recordedUsernames.join(', ')})` : '';
    await logPurchase(orderId, userId, product.name, quantity, totalCost, 'completed', deliveredItems.length, antipublicInfo);
    if (product.cooldown > 0) {
        const config = require('../config.json');
        const guild = client.guilds.cache.first();
        if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            const hasNoCooldownRole = config.noCooldownRole && 
                                    config.noCooldownRole !== 'your_no_cooldown_role_id_here' && 
                                    member && member.roles.cache.has(config.noCooldownRole);
            if (!hasNoCooldownRole) {
                await setCooldown(userId, product.name);
            }
        }
    }
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('purchase')
        .setDescription('Purchase products from the store')
        .addStringOption(option =>
            option.setName('product')
                .setDescription('Select a product to purchase')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Quantity to purchase')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(50)),
    async autocomplete(interaction) {
        try {
            const products = await getAllProducts();
            const choices = products.filter(p => p.stock > 0).map(product => ({
                name: `${product.name} (${product.stock} available) - ${product.price} coins each`,
                value: product.name
            }));
            const focusedValue = interaction.options.getFocused();
            const filtered = choices.filter(choice =>
                choice.name.toLowerCase().includes(focusedValue.toLowerCase())
            );
            await interaction.respond(filtered.slice(0, 25));
        } catch (error) {
            console.error(error);
            await interaction.respond([]);
        }
    },
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        const productName = interaction.options.getString('product');
        const quantity = interaction.options.getInteger('quantity');
        const userId = interaction.user.id;
        try {
            const product = await getProduct(productName);
            if (!product) {
                await interaction.editReply('Product not found!');
                return;
            }
            if (product.stock < quantity) {
                await interaction.editReply(`Not enough stock! Available: ${product.stock}, Requested: ${quantity}`);
                return;
            }
            const config = require('../config.json');
            const hasNoCooldownRole = config.noCooldownRole && 
                                    config.noCooldownRole !== 'your_no_cooldown_role_id_here' && 
                                    interaction.member.roles.cache.has(config.noCooldownRole);
            if (!hasNoCooldownRole && product.cooldown > 0) {
                const cooldownData = await getCooldown(userId, productName);
                if (cooldownData) {
                    const lastPurchase = new Date(cooldownData.last_purchase);
                    const cooldownEnd = new Date(lastPurchase.getTime() + (product.cooldown * 1000));
                    const now = new Date();
                    if (now < cooldownEnd) {
                        const remainingTime = Math.ceil((cooldownEnd - now) / 1000);
                        const minutes = Math.floor(remainingTime / 60);
                        const seconds = remainingTime % 60;
                        const timeString = minutes > 0 
                            ? `${minutes}m ${seconds}s` 
                            : `${seconds}s`;
                        await interaction.editReply(`⏰ You're on cooldown for **${productName}**!\nTime remaining: **${timeString}**`);
                        return;
                    }
                }
            }
            const totalCost = product.price * quantity;
            const userCoins = await getUserCoins(userId);
            const balance = userCoins ? userCoins.coins : 0;
            if (balance < totalCost) {
                await interaction.editReply(`Insufficient balance! Cost: ${totalCost} coins, Your balance: ${balance} coins`);
                return;
            }
            const orderId = generateOrderId();
            await removeCoins(userId, totalCost);
            await addOrder(orderId, userId, productName, quantity, totalCost, product.cookieMode);
            await logBalanceChange(userId, -totalCost, 'Purchase', `Order ${orderId} - ${productName}`, orderId);
            const user = await interaction.user;
            const processingEmbed = new EmbedBuilder()
                .setTitle(`Order \`#${orderId}\``)
                .setDescription('**```Your order is being processed```**')
                .setColor(getRandomColor());
            await user.send({ embeds: [processingEmbed] });
            await interaction.editReply(`Order created! Check your DMs for order #${orderId}`);
            console.log(`[PURCHASE] Queueing order ${orderId} for batch processing - Product: ${productName}, Quantity: ${quantity}`);
            queueOrder(orderId, userId, productName, quantity, interaction.client);
        } catch (error) {
            console.error('Purchase error:', error);
            await interaction.editReply('Failed to create order!');
        }
    },
};