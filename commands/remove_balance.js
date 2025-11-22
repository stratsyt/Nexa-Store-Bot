const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { removeCoins, getUserCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove_balance')
        .setDescription('Remove coins from a user\'s balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove coins from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('coins')
                .setDescription('Amount of coins to remove')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const user = interaction.options.getUser('user');
        const coins = interaction.options.getInteger('coins');
        try {
            await removeCoins(user.id, coins);
            const userCoins = await getUserCoins(user.id);
            const newBalance = userCoins ? userCoins.coins : 0;
            const embed = new EmbedBuilder()
                .setTitle('💰 Balance Updated')
                .setDescription(`Removed **${coins}** coins from ${user.username}\nNew balance: **${newBalance}** coins`)
                .setColor(getRandomColor())
                .setFooter({ text: `User ID: ${user.id}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to remove coins!', ephemeral: true });
        }
    },
};