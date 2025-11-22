const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkBlacklist } = require('../utils/blacklist');
const { getRandomColor } = require('../utils/randomcolor');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbDir = path.join(__dirname, '..', 'databases');
const ordersDb = new sqlite3.Database(path.join(dbDir, 'orders.db'));
const keysDb = new sqlite3.Database(path.join(dbDir, 'keys.db'));
const depositsDb = new sqlite3.Database(path.join(dbDir, 'deposits.db'));
const storeDb = new sqlite3.Database(path.join(dbDir, 'store.db'));
function getDateRange(period) {
    const now = new Date();
    let startDate;
    switch (period) {
        case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case 'lifetime':
            startDate = new Date('2020-01-01'); 
            break;
        default:
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    return {
        start: startDate.toISOString(),
        end: now.toISOString()
    };
}
function getOrderMetrics(period) {
    return new Promise((resolve, reject) => {
        const { start, end } = getDateRange(period);
        const query = period === 'lifetime' 
            ? `SELECT 
                COUNT(*) as total_orders,
                SUM(quantity) as total_items_sold,
                SUM(total_cost) as total_revenue,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_orders,
                AVG(total_cost) as avg_order_value
               FROM orders`
            : `SELECT 
                COUNT(*) as total_orders,
                SUM(quantity) as total_items_sold,
                SUM(total_cost) as total_revenue,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_orders,
                AVG(total_cost) as avg_order_value
               FROM orders 
               WHERE created_at >= ? AND created_at <= ?`;
        const params = period === 'lifetime' ? [] : [start, end];
        ordersDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
        });
    });
}
function getTopProducts(period) {
    return new Promise((resolve, reject) => {
        const { start, end } = getDateRange(period);
        const query = period === 'lifetime'
            ? `SELECT 
                product_name,
                COUNT(*) as order_count,
                SUM(quantity) as total_sold,
                SUM(total_cost) as revenue
               FROM orders 
               GROUP BY product_name 
               ORDER BY total_sold DESC 
               LIMIT 5`
            : `SELECT 
                product_name,
                COUNT(*) as order_count,
                SUM(quantity) as total_sold,
                SUM(total_cost) as revenue
               FROM orders 
               WHERE created_at >= ? AND created_at <= ?
               GROUP BY product_name 
               ORDER BY total_sold DESC 
               LIMIT 5`;
        const params = period === 'lifetime' ? [] : [start, end];
        ordersDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}
function getKeyMetrics(period) {
    return new Promise((resolve, reject) => {
        const { start, end } = getDateRange(period);
        const query = period === 'lifetime'
            ? `SELECT 
                COUNT(*) as total_keys_created,
                COUNT(CASE WHEN redeemed = 1 THEN 1 END) as keys_redeemed,
                SUM(coin_amount) as total_coins_generated,
                SUM(CASE WHEN redeemed = 1 THEN coin_amount ELSE 0 END) as coins_redeemed
               FROM keys`
            : `SELECT 
                COUNT(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 END) as total_keys_created,
                COUNT(CASE WHEN redeemed_at >= ? AND redeemed_at <= ? THEN 1 END) as keys_redeemed,
                SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN coin_amount ELSE 0 END) as total_coins_generated,
                SUM(CASE WHEN redeemed_at >= ? AND redeemed_at <= ? THEN coin_amount ELSE 0 END) as coins_redeemed
               FROM keys`;
        const params = period === 'lifetime' ? [] : [start, end, start, end, start, end, start, end];
        keysDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
        });
    });
}
function getDepositMetrics(period) {
    return new Promise((resolve, reject) => {
        const { start, end } = getDateRange(period);
        const query = period === 'lifetime'
            ? `SELECT 
                COUNT(*) as total_deposits,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_deposits,
                SUM(CASE WHEN status = 'completed' THEN coin_amount ELSE 0 END) as coins_deposited,
                SUM(CASE WHEN status = 'completed' THEN amount_usd ELSE 0 END) as usd_deposited,
                AVG(CASE WHEN status = 'completed' THEN amount_usd END) as avg_deposit_usd
               FROM deposits`
            : `SELECT 
                COUNT(*) as total_deposits,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_deposits,
                SUM(CASE WHEN status = 'completed' THEN coin_amount ELSE 0 END) as coins_deposited,
                SUM(CASE WHEN status = 'completed' THEN amount_usd ELSE 0 END) as usd_deposited,
                AVG(CASE WHEN status = 'completed' THEN amount_usd END) as avg_deposit_usd
               FROM deposits 
               WHERE created_at >= ? AND created_at <= ?`;
        const params = period === 'lifetime' ? [] : [start, end];
        depositsDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
        });
    });
}
function getRefundMetrics(period) {
    return new Promise((resolve, reject) => {
        const { start, end } = getDateRange(period);
        const query = period === 'lifetime'
            ? `SELECT 
                COUNT(*) as total_refunds,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_refunds,
                COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_refunds,
                SUM(CASE WHEN status = 'approved' THEN approved_amount ELSE 0 END) as total_refunded
               FROM refunds`
            : `SELECT 
                COUNT(*) as total_refunds,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_refunds,
                COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_refunds,
                SUM(CASE WHEN status = 'approved' THEN approved_amount ELSE 0 END) as total_refunded
               FROM refunds 
               WHERE created_at >= ? AND created_at <= ?`;
        const params = period === 'lifetime' ? [] : [start, end];
        ordersDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
        });
    });
}
async function createMetricsEmbed(period) {
    try {
        const [orderMetrics, topProducts, keyMetrics, depositMetrics, refundMetrics] = await Promise.all([
            getOrderMetrics(period),
            getTopProducts(period),
            getKeyMetrics(period),
            getDepositMetrics(period),
            getRefundMetrics(period)
        ]);
        const periodNames = {
            '24h': 'Last 24 Hours',
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days',
            'lifetime': 'All Time'
        };
        const embed = new EmbedBuilder()
            .setTitle(`📊 Shop Metrics - ${periodNames[period]}`)
            .setColor(getRandomColor())
            .setTimestamp()
            .setFooter({ text: 'Shop Analytics • Updated' });
        const totalOrders = orderMetrics.total_orders || 0;
        const completedOrders = orderMetrics.completed_orders || 0;
        const failedOrders = orderMetrics.failed_orders || 0;
        const successRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : '0';
        embed.addFields({
            name: '🛒 Orders',
            value: `📦 **Total:** ${totalOrders.toLocaleString()}\n` +
                   `✅ **Completed:** ${completedOrders.toLocaleString()}\n` +
                   `❌ **Failed:** ${failedOrders.toLocaleString()}\n` +
                   `📈 **Success Rate:** ${successRate}%\n` +
                   `🎯 **Items Sold:** ${(orderMetrics.total_items_sold || 0).toLocaleString()}\n` +
                   `💰 **Revenue:** ${(orderMetrics.total_revenue || 0).toLocaleString()} coins`,
            inline: true
        });
        const totalDeposits = depositMetrics.total_deposits || 0;
        const completedDeposits = depositMetrics.completed_deposits || 0;
        const depositSuccessRate = totalDeposits > 0 ? ((completedDeposits / totalDeposits) * 100).toFixed(1) : '0';
        embed.addFields({
            name: '💰 Crypto Deposits',
            value: `📊 **Total:** ${totalDeposits.toLocaleString()}\n` +
                   `✅ **Completed:** ${completedDeposits.toLocaleString()}\n` +
                   `📈 **Success Rate:** ${depositSuccessRate}%\n` +
                   `🪙 **Coins Added:** ${(depositMetrics.coins_deposited || 0).toLocaleString()}\n` +
                   `💵 **USD Value:** $${(depositMetrics.usd_deposited || 0).toFixed(2)}\n` +
                   `📊 **Avg Deposit:** $${(depositMetrics.avg_deposit_usd || 0).toFixed(2)}`,
            inline: true
        });
        const totalKeys = keyMetrics.total_keys_created || 0;
        const redeemedKeys = keyMetrics.keys_redeemed || 0;
        const keyRedemptionRate = totalKeys > 0 ? ((redeemedKeys / totalKeys) * 100).toFixed(1) : '0';
        embed.addFields({
            name: '🔑 Redeem Keys',
            value: `🆕 **Created:** ${totalKeys.toLocaleString()}\n` +
                   `✅ **Redeemed:** ${redeemedKeys.toLocaleString()}\n` +
                   `📈 **Redemption Rate:** ${keyRedemptionRate}%\n` +
                   `🎁 **Coins Generated:** ${(keyMetrics.total_coins_generated || 0).toLocaleString()}\n` +
                   `💎 **Coins Redeemed:** ${(keyMetrics.coins_redeemed || 0).toLocaleString()}`,
            inline: true
        });
        const totalRefunds = refundMetrics.total_refunds || 0;
        const approvedRefunds = refundMetrics.approved_refunds || 0;
        const deniedRefunds = refundMetrics.denied_refunds || 0;
        embed.addFields({
            name: '🔄 Refunds',
            value: `**Total Requests:** ${totalRefunds.toLocaleString()}\n` +
                   `**Approved:** ${approvedRefunds.toLocaleString()}\n` +
                   `**Denied:** ${deniedRefunds.toLocaleString()}\n` +
                   `**Pending:** ${(totalRefunds - approvedRefunds - deniedRefunds).toLocaleString()}\n` +
                   `**Refunded:** ${(refundMetrics.total_refunded || 0).toLocaleString()} coins`,
            inline: true
        });
        const totalRevenue = (orderMetrics.total_revenue || 0);
        const totalRefunded = (refundMetrics.total_refunded || 0);
        const netRevenue = totalRevenue - totalRefunded;
        const avgOrderValue = orderMetrics.avg_order_value || 0;
        embed.addFields({
            name: '💎 Financial Summary',
            value: `**Gross Revenue:** ${totalRevenue.toLocaleString()} coins\n` +
                   `**Refunded:** ${totalRefunded.toLocaleString()} coins\n` +
                   `**Net Revenue:** ${netRevenue.toLocaleString()} coins\n` +
                   `**Avg Order Value:** ${avgOrderValue.toFixed(1)} coins`,
            inline: true
        });
        if (topProducts.length > 0) {
            const topProductsText = topProducts.map((product, index) => 
                `**${index + 1}.** ${product.product_name}\n` +
                `   └ ${product.total_sold} sold • ${product.revenue} coins`
            ).join('\n');
            embed.addFields({
                name: '🏆 Top Products',
                value: topProductsText,
                inline: false
            });
        }
        return embed;
    } catch (error) {
        console.error('Error creating metrics embed:', error);
        return new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Failed to load metrics data.')
            .setColor(0xFF0000);
    }
}
function createPeriodButtons(currentPeriod) {
    const buttons = [
        new ButtonBuilder()
            .setCustomId('metrics_24h')
            .setLabel('24 Hours')
            .setStyle(currentPeriod === '24h' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('metrics_7d')
            .setLabel('7 Days')
            .setStyle(currentPeriod === '7d' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('metrics_30d')
            .setLabel('30 Days')
            .setStyle(currentPeriod === '30d' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('metrics_lifetime')
            .setLabel('All Time')
            .setStyle(currentPeriod === 'lifetime' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ];
    return new ActionRowBuilder().addComponents(buttons);
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('metrics')
        .setDescription('View shop analytics and metrics'),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        try {
            const embed = await createMetricsEmbed('24h');
            const buttons = createPeriodButtons('24h');
            await interaction.editReply({
                embeds: [embed],
                components: [buttons]
            });
        } catch (error) {
            console.error('Metrics command error:', error);
            await interaction.editReply({
                content: '❌ Failed to load metrics data.',
                ephemeral: true
            });
        }
    },
    async handleButton(interaction) {
        if (!interaction.customId.startsWith('metrics_')) return;
        const period = interaction.customId.replace('metrics_', '');
        await interaction.deferUpdate();
        try {
            const embed = await createMetricsEmbed(period);
            const buttons = createPeriodButtons(period);
            await interaction.editReply({
                embeds: [embed],
                components: [buttons]
            });
        } catch (error) {
            console.error('Metrics button error:', error);
            await interaction.followUp({
                content: '❌ Failed to update metrics data.',
                ephemeral: true
            });
        }
    }
};