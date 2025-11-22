const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { checkBlacklist } = require('../utils/blacklist');
const { getOrder } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('order')
        .setDescription('View order details and deliverables')
        .addStringOption(option =>
            option.setName('order_id')
                .setDescription('Order ID to view')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        const orderId = interaction.options.getString('order_id').toUpperCase();
        const userId = interaction.user.id;
        try {
            const order = await getOrder(orderId);
            if (!order) {
                await interaction.editReply('Order not found!');
                return;
            }
            const isAdmin = await checkAdmin(interaction);
            if (order.user_id !== userId && !isAdmin) {
                await interaction.editReply('You can only view your own orders!');
                return;
            }
            const statusEmoji = {
                'processing': '🔄',
                'completed': '✅',
                'failed': '❌',
                'cancelled': '🚫'
            };
            const orderEmbed = new EmbedBuilder()
                .setTitle(`Order #${orderId}`)
                .setDescription(`**Status:** ${statusEmoji[order.status] || '❓'} ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}`)
                .addFields(
                    { name: '👤 Customer', value: `<@${order.user_id}>`, inline: true },
                    { name: '📦 Product', value: order.product_name, inline: true },
                    { name: '🔢 Quantity', value: order.quantity.toString(), inline: true },
                    { name: '💰 Total Cost', value: `${order.total_cost} coins`, inline: true },
                    { name: '📅 Created', value: `<t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:F>`, inline: true },
                    { name: '✅ Completed', value: order.completed_at ? `<t:${Math.floor(new Date(order.completed_at).getTime() / 1000)}:F>` : 'Not completed', inline: true }
                )
                .setColor(getRandomColor())
                .setFooter({ text: `Order ID: ${orderId}` });
            const ordersDir = path.join(__dirname, '..', 'orders');
            let attachment = null;
            if (order.status === 'completed') {
                if (order.cookie_mode) {
                    const orderDir = path.join(ordersDir, orderId);
                    if (fs.existsSync(orderDir)) {
                        const zip = new AdmZip();
                        const files = fs.readdirSync(orderDir);
                        files.forEach(file => {
                            const filePath = path.join(orderDir, file);
                            if (fs.statSync(filePath).isFile()) {
                                const content = fs.readFileSync(filePath);
                                zip.addFile(file, content);
                            }
                        });
                        const tempDir = path.join(__dirname, '..', 'temp');
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        const zipPath = path.join(tempDir, `${orderId}_redownload.zip`);
                        zip.writeZip(zipPath);
                        attachment = new AttachmentBuilder(zipPath, { name: `${orderId}.zip` });
                        setTimeout(() => {
                            if (fs.existsSync(zipPath)) {
                                fs.unlinkSync(zipPath);
                            }
                        }, 30000);
                    }
                } else {
                    const orderFile = path.join(ordersDir, `${orderId}.txt`);
                    if (fs.existsSync(orderFile)) {
                        attachment = new AttachmentBuilder(orderFile, { name: `${orderId}.txt` });
                    }
                }
            }
            const response = { embeds: [orderEmbed] };
            if (attachment) {
                response.files = [attachment];
                orderEmbed.setDescription(orderEmbed.data.description + '\n\n📎 **Deliverables attached below**');
            } else if (order.status === 'completed') {
                orderEmbed.setDescription(orderEmbed.data.description + '\n\n⚠️ **Deliverables not found**');
            }
            await interaction.editReply(response);
        } catch (error) {
            console.error('Order lookup error:', error);
            await interaction.editReply('Failed to retrieve order information!');
        }
    },
};