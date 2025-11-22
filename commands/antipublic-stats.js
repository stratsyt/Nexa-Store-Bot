const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { getDeliveryStats, getUserDeliveredAccounts } = require('../utils/antipublic');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('antipublic_stats')
        .setDescription('View antipublic system statistics (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View specific user\'s delivered accounts')
                .setRequired(false)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user');
        try {
            if (targetUser) {
                const userAccounts = await getUserDeliveredAccounts(targetUser.id);
                if (userAccounts.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('📊 User Antipublic Records')
                        .setDescription(`**${targetUser.username}** has no recorded deliveries in the antipublic system.`)
                        .setColor(0xff9900);
                    await interaction.editReply({ embeds: [embed] });
                    return;
                }
                let description = `**${targetUser.username}** has **${userAccounts.length}** recorded deliveries:\n\n`;
                const recentAccounts = userAccounts.slice(0, 10);
                for (const account of recentAccounts) {
                    const deliveredDate = new Date(account.delivered_at);
                    const timestamp = Math.floor(deliveredDate.getTime() / 1000);
                    description += `**${account.minecraft_username}** - ${account.product_name}\n`;
                    description += `└ Order: #${account.order_id} • <t:${timestamp}:R>\n\n`;
                }
                if (userAccounts.length > 10) {
                    description += `*... and ${userAccounts.length - 10} more*`;
                }
                const embed = new EmbedBuilder()
                    .setTitle('📊 User Antipublic Records')
                    .setDescription(description.trim())
                    .setColor(getRandomColor())
                    .setFooter({ text: `Total: ${userAccounts.length} deliveries` });
                await interaction.editReply({ embeds: [embed] });
            } else {
                const stats = await getDeliveryStats();
                const embed = new EmbedBuilder()
                    .setTitle('📊 Antipublic System Statistics')
                    .setDescription('Overview of the antipublic delivery tracking system')
                    .addFields(
                        { name: '🎮 Total Usernames Delivered', value: stats.total_delivered.toString(), inline: true },
                        { name: '👥 Unique Customers', value: stats.unique_users.toString(), inline: true },
                        { name: '📦 Products Delivered', value: stats.products_delivered.toString(), inline: true }
                    )
                    .setColor(getRandomColor())
                    .setFooter({ text: 'Antipublic System • Preventing duplicate deliveries' });
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Antipublic stats error:', error);
            const embed = new EmbedBuilder()
                .setTitle('❌ Stats Failed')
                .setDescription('An error occurred while fetching antipublic statistics.')
                .setColor(0xff0000);
            await interaction.editReply({ embeds: [embed] });
        }
    },
};