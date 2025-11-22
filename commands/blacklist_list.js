const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { getAllBlacklisted } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist_list')
        .setDescription('View all blacklisted users'),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        try {
            const blacklisted = await getAllBlacklisted();
            if (blacklisted.length === 0) {
                await interaction.reply({ content: 'No users are currently blacklisted!', ephemeral: true });
                return;
            }
            let description = '';
            for (const entry of blacklisted) {
                const date = new Date(entry.blacklisted_at).toLocaleDateString();
                description += `<@${entry.user_id}> (${entry.user_id})\nBlacklisted: ${date}\n\n`;
            }
            const embed = new EmbedBuilder()
                .setTitle('🚫 Blacklisted Users')
                .setDescription(description.trim())
                .setColor(getRandomColor())
                .setFooter({ text: `Total: ${blacklisted.length} users` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to fetch blacklist!', ephemeral: true });
        }
    },
};