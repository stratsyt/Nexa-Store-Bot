const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkBlacklist } = require('../utils/blacklist');
const { checkAdmin } = require('../utils/auth');
const { clearAllCooldowns, getAllCooldowns } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const { logAdminAction } = require('../utils/logging');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear-cooldowns')
        .setDescription('Clear all purchase cooldowns for all users (Admin only)'),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        try {
            const currentCooldowns = await getAllCooldowns();
            const cooldownCount = currentCooldowns.length;
            await clearAllCooldowns();
            await logAdminAction(interaction.user.id, 'Clear All Cooldowns', null, {
                'Cooldowns Cleared': cooldownCount,
                'Command': '/clear-cooldowns'
            });
            const embed = new EmbedBuilder()
                .setTitle('✅ Cooldowns Cleared')
                .setDescription(`Successfully cleared **${cooldownCount}** purchase cooldowns for all users.`)
                .addFields(
                    { name: '👨‍💼 Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔄 Cooldowns Cleared', value: cooldownCount.toString(), inline: true },
                    { name: '📅 Cleared At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setColor(getRandomColor())
                .setTimestamp()
                .setFooter({ text: 'All users can now purchase immediately' });
            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Admin ${interaction.user.tag} (${interaction.user.id}) cleared ${cooldownCount} cooldowns`);
        } catch (error) {
            console.error('Clear cooldowns error:', error);
            await interaction.editReply({
                content: '❌ Failed to clear cooldowns. Please try again or contact support.',
                ephemeral: true
            });
        }
    },
};