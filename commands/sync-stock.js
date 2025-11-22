const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { syncAllProductStock, getAllProducts } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync-stock')
        .setDescription('Sync database stock counts with actual files (Admin only)'),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply();
        try {
            console.log('🔄 Admin initiated stock sync...');
            const syncResults = await syncAllProductStock();
            if (syncResults.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Stock Sync Complete')
                    .setDescription('All product stock counts are already in sync with actual files.')
                    .setColor(0x00ff00);
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            let description = `Synced **${syncResults.length}** products:\n\n`;
            for (const result of syncResults) {
                const changeIcon = result.difference > 0 ? '📈' : '📉';
                const changeText = result.difference > 0 ? `+${result.difference}` : `${result.difference}`;
                description += `${changeIcon} **${result.name}**\n`;
                description += `└ ${result.oldStock} → ${result.newStock} (${changeText})\n\n`;
            }
            const embed = new EmbedBuilder()
                .setTitle('🔄 Stock Sync Complete')
                .setDescription(description.trim())
                .setColor(getRandomColor())
                .setFooter({ text: `${syncResults.length} products updated` });
            await interaction.editReply({ embeds: [embed] });
            console.log(`📊 Admin stock sync completed: ${syncResults.length} products updated`);
        } catch (error) {
            console.error('Stock sync error:', error);
            const embed = new EmbedBuilder()
                .setTitle('❌ Stock Sync Failed')
                .setDescription('An error occurred while syncing stock counts.')
                .setColor(0xff0000);
            await interaction.editReply({ embeds: [embed] });
        }
    },
};