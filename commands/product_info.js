const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllProducts, getProduct } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const { checkBlacklist } = require('../utils/blacklist');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('product_info')
        .setDescription('View detailed information about a product')
        .addStringOption(option =>
            option.setName('product')
                .setDescription('Select a product to view')
                .setRequired(true)
                .setAutocomplete(true)),
    async autocomplete(interaction) {
        try {
            const products = await getAllProducts();
            const choices = products.map(product => ({
                name: `${product.name} (${product.stock} in stock) - ${product.price} coins`,
                value: product.name
            }));
            const focusedValue = interaction.options.getFocused();
            const filtered = choices.filter(choice =>
                choice.name.toLowerCase().includes(focusedValue.toLowerCase())
            );
            await interaction.respond(filtered.slice(0, 25));
        } catch (error) {
            console.error(error);
            await interaction.respond([]);
        }
    },
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        const productName = interaction.options.getString('product');
        try {
            const product = await getProduct(productName);
            if (!product) {
                await interaction.editReply('❌ Product not found!');
                return;
            }
            let precheckDesc = 'Disabled';
            if (product.precheck_level === 1) {
                precheckDesc = 'Level 1 - Basic Validation';
            } else if (product.precheck_level === 2) {
                precheckDesc = 'Level 2 - Full Validation + Ban Check';
            }
            let accountType = 'Standard Format';
            if (product.cookieMode) {
                accountType = 'Cookie Files';
            } else if (product.precheck_type === 'token') {
                accountType = 'Access Tokens';
            } else if (product.precheck_type === 'email:pass') {
                accountType = 'Email:Password';
            }
            let cooldownText = 'None';
            if (product.cooldown > 0) {
                const hours = Math.floor(product.cooldown / 3600);
                const minutes = Math.floor((product.cooldown % 3600) / 60);
                const seconds = product.cooldown % 60;
                if (hours > 0) {
                    cooldownText = `${hours}h ${minutes}m`;
                } else if (minutes > 0) {
                    cooldownText = `${minutes}m ${seconds}s`;
                } else {
                    cooldownText = `${seconds}s`;
                }
            }
            let stockEmoji = '✅';
            let stockStatus = 'In Stock';
            if (product.stock === 0) {
                stockEmoji = '❌';
                stockStatus = 'Out of Stock';
            } else if (product.stock < 10) {
                stockEmoji = '⚠️';
                stockStatus = 'Low Stock';
            }
            const embed = new EmbedBuilder()
                .setTitle(`📦 ${product.name}`)
                .setDescription(`Detailed information about this product`)
                .addFields(
                    { 
                        name: '💰 Price', 
                        value: `${product.price} coins`, 
                        inline: true 
                    },
                    { 
                        name: `${stockEmoji} Stock`, 
                        value: `${product.stock} available\n*${stockStatus}*`, 
                        inline: true 
                    },
                    { 
                        name: '⏰ Cooldown', 
                        value: cooldownText, 
                        inline: true 
                    },
                    { 
                        name: '📋 Account Type', 
                        value: accountType, 
                        inline: true 
                    },
                    { 
                        name: '🔍 Precheck', 
                        value: precheckDesc, 
                        inline: true 
                    },
                    { 
                        name: '📁 Format', 
                        value: product.cookieMode ? 'Cookie Files (ZIP)' : 'Text File', 
                        inline: true 
                    }
                )
                .setColor(getRandomColor())
                .setFooter({ text: `Use /purchase to buy this product` })
                .setTimestamp();
            if (product.precheck_level > 0) {
                let precheckDetails = '';
                if (product.precheck_level === 1) {
                    precheckDetails = '• Validates account credentials\n';
                    precheckDetails += '• Checks Microsoft authentication\n';
                    precheckDetails += '• Verifies Minecraft ownership\n';
                    precheckDetails += '• **No ban checking** (faster)';
                } else if (product.precheck_level === 2) {
                    precheckDetails = '• Validates account credentials\n';
                    precheckDetails += '• Checks Microsoft authentication\n';
                    precheckDetails += '• Verifies Minecraft ownership\n';
                    precheckDetails += '• **Checks Hypixel ban status**\n';
                    precheckDetails += '• Only delivers unbanned accounts';
                }
                embed.addFields({
                    name: '🛡️ Quality Assurance',
                    value: precheckDetails,
                    inline: false
                });
            }
            if (product.stock > 0 && product.stock < 10) {
                embed.addFields({
                    name: '⚠️ Low Stock Warning',
                    value: `Only ${product.stock} accounts remaining! Purchase soon before they run out.`,
                    inline: false
                });
            }
            if (product.stock === 0) {
                embed.addFields({
                    name: '❌ Out of Stock',
                    value: 'This product is currently unavailable. Check back later or contact support for restock information.',
                    inline: false
                });
            }
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Product info error:', error);
            await interaction.editReply('❌ Failed to retrieve product information!');
        }
    },
};