const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { recordDeliveredAccount, isUsernameDelivered } = require('../utils/antipublic');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('antipublic_add')
        .setDescription('Manually add a username to the antipublic database (Admin only)')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Minecraft username to add')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User who received this account')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('order_id')
                .setDescription('Order ID (use MANUAL-XXX if unknown)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('product')
                .setDescription('Product name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('account_data')
                .setDescription('Full account data (email:pass or username:pass)')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply();
        const username = interaction.options.getString('username');
        const user = interaction.options.getUser('user');
        const orderId = interaction.options.getString('order_id');
        const product = interaction.options.getString('product');
        const accountData = interaction.options.getString('account_data');
        try {
            const alreadyDelivered = await isUsernameDelivered(username);
            if (alreadyDelivered) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Username Already Recorded')
                    .setDescription(`Username **${username}** is already in the antipublic database.\n\nUse \`/ign-lookup ${username}\` to see existing record.`)
                    .setColor(0xff9900);
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            await recordDeliveredAccount(username, user.id, orderId, product, accountData);
            const embed = new EmbedBuilder()
                .setTitle('✅ Username Added to Antipublic')
                .setDescription(`Successfully added **${username}** to the antipublic database.`)
                .addFields(
                    { name: '👤 User', value: `${user.username} (<@${user.id}>)`, inline: true },
                    { name: '🛒 Order ID', value: orderId, inline: true },
                    { name: '📦 Product', value: product, inline: true },
                    { name: '🔒 Account Data', value: `||${accountData}||`, inline: false }
                )
                .setColor(getRandomColor())
                .setFooter({ text: 'Antipublic System' });
            await interaction.editReply({ embeds: [embed] });
            console.log(`[ANTIPUBLIC] Manually added username: ${username} for user ${user.id} (${user.username})`);
        } catch (error) {
            console.error('Antipublic add error:', error);
            const embed = new EmbedBuilder()
                .setTitle('❌ Failed to Add Username')
                .setDescription('An error occurred while adding the username to the antipublic database.')
                .setColor(0xff0000);
            await interaction.editReply({ embeds: [embed] });
        }
    },
};