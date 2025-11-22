const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const { checkBlacklist } = require('../utils/blacklist');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('View your current coin balance'),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        const userId = interaction.user.id;
        try {
            const userCoins = await getUserCoins(userId);
            const balance = userCoins ? userCoins.coins : 0;
            const embed = new EmbedBuilder()
                .setTitle('💰 Your Balance')
                .setDescription(`You have **${balance}** coins`)
                .setColor(getRandomColor())
                .setFooter({ text: `User ID: ${userId}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to fetch balance!', ephemeral: true });
        }
    },
};