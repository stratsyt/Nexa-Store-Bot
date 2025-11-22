const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkBlacklist } = require('../utils/blacklist');
const { getOrder, addRefund } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const config = require('../config.json');
function generateRefundId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'REF-';
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 5; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 1) result += '-';
    }
    return result;
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('refund')
        .setDescription('Request a refund for an order')
        .addStringOption(option =>
            option.setName('order_id')
                .setDescription('Order ID to refund')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to refund (in coins)')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for refund')
                .setRequired(true)
                .setMaxLength(500)),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        const orderId = interaction.options.getString('order_id').toUpperCase();
        const requestedAmount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');
        const userId = interaction.user.id;
        try {
            const order = await getOrder(orderId);
            if (!order) {
                await interaction.reply({ content: 'Order not found!', ephemeral: true });
                return;
            }
            if (order.user_id !== userId) {
                await interaction.reply({ content: 'You can only request refunds for your own orders!', ephemeral: true });
                return;
            }
            if (order.status !== 'completed') {
                await interaction.reply({ content: 'You can only request refunds for completed orders!', ephemeral: true });
                return;
            }
            if (requestedAmount > order.total_cost) {
                await interaction.reply({ content: `Refund amount cannot exceed order total (${order.total_cost} coins)!`, ephemeral: true });
                return;
            }
            const orderTime = new Date(order.completed_at);
            const currentTime = new Date();
            const timeDiff = (currentTime - orderTime) / (1000 * 60 * 60); 
            if (timeDiff > 2) {
                await interaction.reply({ content: 'Refund requests are only accepted within 2 hours of purchase!', ephemeral: true });
                return;
            }
            const modal = new ModalBuilder()
                .setCustomId(`refund_proof_${orderId}_${requestedAmount}`)
                .setTitle('Refund Request - Proof Required');
            const proofInput = new TextInputBuilder()
                .setCustomId('proof_links')
                .setLabel('Proof Links (Screenshots, Videos, etc.)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter proof links (imgur, streamable, etc.)\nExample: https://imgur.com/abc123')
                .setRequired(true)
                .setMaxLength(1000);
            const actionRow = new ActionRowBuilder().addComponents(proofInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
            interaction.client.refundData = interaction.client.refundData || {};
            interaction.client.refundData[`${orderId}_${requestedAmount}`] = {
                orderId,
                requestedAmount,
                reason,
                userId,
                order
            };
        } catch (error) {
            console.error('Refund request error:', error);
            await interaction.reply({ content: 'Failed to process refund request!', ephemeral: true });
        }
    },
};