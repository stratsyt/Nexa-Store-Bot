const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getKey, redeemKey, addCoins, getUserCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const { checkBlacklist } = require('../utils/blacklist');
const { logTransaction, logBalanceChange } = require('../utils/logging');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Redeem a coin key')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('The key to redeem')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        const keyCode = interaction.options.getString('key').toUpperCase();
        const userId = interaction.user.id;
        try {
            const key = await getKey(keyCode);
            if (!key) {
                await interaction.reply({ content: 'Invalid key!', ephemeral: true });
                return;
            }
            if (key.redeemed) {
                await interaction.reply({ content: 'This key has already been redeemed!', ephemeral: true });
                return;
            }
            await redeemKey(keyCode, userId);
            await addCoins(userId, key.coin_amount);
            await logTransaction('key_redeem', userId, key.coin_amount, { keyCode });
            await logBalanceChange(userId, key.coin_amount, 'Key Redemption', `Redeemed key: ${keyCode}`);
            const userCoins = await getUserCoins(userId);
            const totalCoins = userCoins ? userCoins.coins : key.coin_amount;
            const embed = new EmbedBuilder()
                .setTitle('🎉 Key Redeemed Successfully!')
                .setDescription(`You received **${key.coin_amount}** coins!\nYour total balance: **${totalCoins}** coins`)
                .setColor(getRandomColor())
                .setFooter({ text: `Key: ${keyCode}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
            try {
                const config = require('../config.json');
                if (config.customerRole && config.customerRole !== 'your_customer_role_id_here') {
                    const member = interaction.member;
                    if (member && !member.roles.cache.has(config.customerRole)) {
                        await member.roles.add(config.customerRole);
                        console.log(`✅ Added customer role to user ${userId} after key redemption`);
                    }
                }
            } catch (roleError) {
                console.log(`⚠️ Could not add customer role to user ${userId}: ${roleError.message}`);
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to redeem key!', ephemeral: true });
        }
    },
};