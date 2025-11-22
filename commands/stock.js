const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getRandomColor } = require('../utils/randomcolor');
const { getAllProducts, getActualStockCount, syncAllProductStock } = require('../utils/database');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('View current store stock'),
    async execute(interaction) {
        try {
            await interaction.deferReply();
            console.log('🔄 Syncing stock counts with actual files...');
            const syncResults = await syncAllProductStock();
            if (syncResults.length > 0) {
                console.log(`📊 Stock sync completed: ${syncResults.length} products updated`);
                for (const result of syncResults) {
                    console.log(`  - ${result.name}: ${result.oldStock} → ${result.newStock} (${result.difference > 0 ? '+' : ''}${result.difference})`);
                }
            }
            const products = await getAllProducts();
            if (products.length === 0) {
                await interaction.editReply('No products found in the store!');
                return;
            }
            let description = '';
            let totalSynced = 0;
            for (const product of products) {
                const actualStock = getActualStockCount(product.name, product.cookieMode);
                const dbStock = product.stock || 0;
                const stockText = actualStock > 0 ? `\`${actualStock}\`` : '`OUT OF STOCK`';
                const syncIndicator = syncResults.find(r => r.name === product.name) ? ' 🔄' : '';
                description += `\`${product.name} - ${product.price} coins\`${syncIndicator}\n└ *Stock: ${stockText}*\n\n`;
                if (syncIndicator) totalSynced++;
            }
            let title = 'CosmicMart Stock';
            if (totalSynced > 0) {
                title += ` (${totalSynced} synced)`;
            }
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description.trim())
                .setColor(getRandomColor())
                .setFooter({ text: 'Stock counts synced with actual files' });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to fetch products!');
        }
    },
};