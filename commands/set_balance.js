const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { setCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_balance')
        .setDescription('Set a user\'s coin balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to set balance for')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('coins')
                .setDescription('Amount of coins to set')
                .setRequired(true)
                .setMinValue(0)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const user = interaction.options.getUser('user');
        const coins = interaction.options.getInteger('coins');
        try {
            await setCoins(user.id, coins);
            const embed = new EmbedBuilder()
                .setTitle('💰 Balance Set')
                .setDescription(`Set ${user.username}'s balance to **${coins}** coins`)
                .setColor(getRandomColor())
                .setFooter({ text: `User ID: ${user.id}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to set balance!', ephemeral: true });
        }
    },
};