const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { getUserCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('view_balance')
        .setDescription('View a user\'s coin balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check balance for')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const user = interaction.options.getUser('user');
        try {
            const userCoins = await getUserCoins(user.id);
            const balance = userCoins ? userCoins.coins : 0;
            const embed = new EmbedBuilder()
                .setTitle('💰 User Balance')
                .setDescription(`${user.username} has **${balance}** coins`)
                .setColor(getRandomColor())
                .setFooter({ text: `User ID: ${user.id}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to fetch user balance!', ephemeral: true });
        }
    },
};