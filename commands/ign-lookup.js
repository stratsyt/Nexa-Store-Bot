const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { getUsernameDeliveryInfo } = require('../utils/antipublic');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('ign-lookup')
        .setDescription('Look up who purchased a specific Minecraft username (Admin only)')
        .addStringOption(option =>
            option.setName('ign')
                .setDescription('Minecraft username to look up')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply();
        const username = interaction.options.getString('ign');
        try {
            console.log(`[IGN-LOOKUP] Looking up username: ${username}`);
            const deliveryInfo = await getUsernameDeliveryInfo(username);
            console.log(`[IGN-LOOKUP] Query result:`, deliveryInfo);
            if (!deliveryInfo) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 IGN Lookup Result')
                    .setDescription(`No delivery record found for username: **${username}**\n\nThis username has either:\n• Never been delivered\n• Was delivered before the antipublic system was implemented\n• The account format didn't contain a clear username`)
                    .setColor(0xff9900)
                    .setFooter({ text: 'Antipublic System' });
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            let userInfo = `<@${deliveryInfo.user_id}>`;
            try {
                const user = await interaction.client.users.fetch(deliveryInfo.user_id);
                userInfo = `${user.username} (<@${deliveryInfo.user_id}>)`;
            } catch (error) {
                userInfo = `Unknown User (<@${deliveryInfo.user_id}>)`;
            }
            const deliveredDate = new Date(deliveryInfo.delivered_at);
            const timestamp = Math.floor(deliveredDate.getTime() / 1000);
            const embed = new EmbedBuilder()
                .setTitle('🔍 IGN Lookup Result')
                .setDescription(`Found delivery record for username: **${username}**`)
                .addFields(
                    { name: '👤 Purchased By', value: userInfo, inline: true },
                    { name: '🛒 Order ID', value: `#${deliveryInfo.order_id}`, inline: true },
                    { name: '📦 Product', value: deliveryInfo.product_name, inline: true },
                    { name: '📅 Delivered At', value: `<t:${timestamp}:F>`, inline: false },
                    { name: '🔒 Account Data', value: `||${deliveryInfo.account_data}||`, inline: false }
                )
                .setColor(getRandomColor())
                .setFooter({ text: `Record ID: ${deliveryInfo.id}` });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('IGN lookup error:', error);
            const embed = new EmbedBuilder()
                .setTitle('❌ Lookup Failed')
                .setDescription('An error occurred while looking up the username.')
                .setColor(0xff0000);
            await interaction.editReply({ embeds: [embed] });
        }
    },
};