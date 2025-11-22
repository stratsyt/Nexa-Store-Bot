const { EmbedBuilder } = require('discord.js');
const { getRandomColor } = require('./randomcolor');
const config = require('../config.json');
let discordClient = null;
function setDiscordClient(client) {
    discordClient = client;
}
async function sendLogToChannel(channelId, embed) {
    if (!discordClient || !channelId || channelId === 'your_purchase_logs_channel_id_here' || channelId === 'your_balance_logs_channel_id_here' || channelId === 'your_transaction_logs_channel_id_here') {
        return; 
    }
    try {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.log(`⚠️ Could not send log to channel ${channelId}: ${error.message}`);
    }
}
async function logPurchase(orderId, userId, productName, quantity, totalCost, status, deliveredItems = null, antipublicInfo = '') {
    const embed = new EmbedBuilder()
        .setTitle('🛒 Purchase Log')
        .addFields(
            { name: '📋 Order ID', value: `\`${orderId}\``, inline: true },
            { name: '👤 User', value: `<@${userId}>`, inline: true },
            { name: '📦 Product', value: productName, inline: true },
            { name: '🔢 Quantity', value: quantity.toString(), inline: true },
            { name: '💰 Total Cost', value: `${totalCost} coins`, inline: true },
            { name: '📊 Status', value: status, inline: true }
        )
        .setColor(status === 'completed' ? 0x00FF00 : status === 'failed' ? 0xFF0000 : 0xFFA500)
        .setTimestamp()
        .setFooter({ text: `User ID: ${userId}` });
    if (deliveredItems !== null) {
        embed.addFields({ name: '📤 Delivered', value: `${deliveredItems} items${antipublicInfo}`, inline: true });
    }
    await sendLogToChannel(config.purchaseLogsChannel, embed);
}
async function logBalanceChange(userId, amount, type, reason, orderId = null) {
    const isPositive = amount > 0;
    const embed = new EmbedBuilder()
        .setTitle(`💰 Balance ${isPositive ? 'Added' : 'Removed'}`)
        .addFields(
            { name: '👤 User', value: `<@${userId}>`, inline: true },
            { name: '💎 Amount', value: `${isPositive ? '+' : ''}${amount} coins`, inline: true },
            { name: '📝 Type', value: type, inline: true },
            { name: '📄 Reason', value: reason, inline: false }
        )
        .setColor(isPositive ? 0x00FF00 : 0xFF0000)
        .setTimestamp()
        .setFooter({ text: `User ID: ${userId}` });
    if (orderId) {
        embed.addFields({ name: '📋 Related Order', value: `\`${orderId}\``, inline: true });
    }
    await sendLogToChannel(config.balanceLogsChannel, embed);
}
async function logTransaction(type, userId, amount, details = {}) {
    let title, color, fields;
    switch (type) {
        case 'crypto_deposit':
            title = '💰 Crypto Deposit';
            color = 0x00FF00;
            fields = [
                { name: '👤 User', value: `<@${userId}>`, inline: true },
                { name: '🪙 Coins Added', value: `${amount} coins`, inline: true },
                { name: '💳 Currency', value: details.currency || 'Unknown', inline: true },
                { name: '💵 USD Amount', value: `$${details.usdAmount || 'Unknown'}`, inline: true },
                { name: '🆔 Payment ID', value: details.paymentId || 'Unknown', inline: true },
                { name: '📊 Status', value: details.status || 'Completed', inline: true }
            ];
            break;
        case 'key_redeem':
            title = '🔑 Key Redeemed';
            color = 0x9932CC;
            fields = [
                { name: '👤 User', value: `<@${userId}>`, inline: true },
                { name: '🪙 Coins Added', value: `${amount} coins`, inline: true },
                { name: '🔑 Key Code', value: `\`${details.keyCode || 'Hidden'}\``, inline: true },
                { name: '📅 Redeemed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            ];
            break;
        case 'refund':
            title = '🔄 Refund Processed';
            color = 0xFFA500;
            fields = [
                { name: '👤 User', value: `<@${userId}>`, inline: true },
                { name: '🪙 Coins Refunded', value: `${amount} coins`, inline: true },
                { name: '📋 Order ID', value: `\`${details.orderId}\``, inline: true },
                { name: '🆔 Refund ID', value: `\`${details.refundId}\``, inline: true },
                { name: '👨‍💼 Processed By', value: `<@${details.processedBy}>`, inline: true },
                { name: '📝 Reason', value: details.reason || 'No reason provided', inline: false }
            ];
            break;
        default:
            title = '💳 Transaction';
            color = 0x0099FF;
            fields = [
                { name: '👤 User', value: `<@${userId}>`, inline: true },
                { name: '💰 Amount', value: `${amount} coins`, inline: true },
                { name: '📝 Type', value: type, inline: true }
            ];
    }
    const embed = new EmbedBuilder()
        .setTitle(title)
        .addFields(fields)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `User ID: ${userId}` });
    await sendLogToChannel(config.transactionLogsChannel, embed);
}
async function logAdminAction(adminId, action, targetUserId = null, details = {}) {
    const embed = new EmbedBuilder()
        .setTitle('👨‍💼 Admin Action')
        .addFields(
            { name: '👤 Admin', value: `<@${adminId}>`, inline: true },
            { name: '⚡ Action', value: action, inline: true }
        )
        .setColor(0xFF6B35)
        .setTimestamp()
        .setFooter({ text: `Admin ID: ${adminId}` });
    if (targetUserId) {
        embed.addFields({ name: '🎯 Target User', value: `<@${targetUserId}>`, inline: true });
    }
    Object.entries(details).forEach(([key, value]) => {
        embed.addFields({ name: key, value: value.toString(), inline: true });
    });
    await sendLogToChannel(config.balanceLogsChannel, embed); 
}
module.exports = {
    setDiscordClient,
    logPurchase,
    logBalanceChange,
    logTransaction,
    logAdminAction
};