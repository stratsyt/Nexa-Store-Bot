const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { removeFromBlacklist, isBlacklisted } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist_remove')
        .setDescription('Remove a user from the blacklist')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove from blacklist')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const user = interaction.options.getUser('user');
        try {
            const wasBlacklisted = await isBlacklisted(user.id);
            if (!wasBlacklisted) {
                await interaction.reply({ content: `${user.username} is not blacklisted!`, ephemeral: true });
                return;
            }
            await removeFromBlacklist(user.id);
            const embed = new EmbedBuilder()
                .setTitle('✅ User Removed from Blacklist')
                .setDescription(`${user.username} has been removed from the blacklist`)
                .setColor(getRandomColor())
                .setFooter({ text: `User ID: ${user.id}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to remove user from blacklist!', ephemeral: true });
        }
    },
};