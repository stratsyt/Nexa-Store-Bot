const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { addCoins, getUserCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('add_balance')
        .setDescription('Add coins to a user\'s balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add coins to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('coins')
                .setDescription('Amount of coins to add')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const user = interaction.options.getUser('user');
        const coins = interaction.options.getInteger('coins');
        try {
            await addCoins(user.id, coins);
            const userCoins = await getUserCoins(user.id);
            const newBalance = userCoins ? userCoins.coins : coins;
            const embed = new EmbedBuilder()
                .setTitle('💰 Balance Updated')
                .setDescription(`Added **${coins}** coins to ${user.username}\nNew balance: **${newBalance}** coins`)
                .setColor(getRandomColor())
                .setFooter({ text: `User ID: ${user.id}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to add coins!', ephemeral: true });
        }
    },
};