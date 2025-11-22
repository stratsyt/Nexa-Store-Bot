const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkAdmin } = require('../utils/auth');
const { getAllProducts, getProduct, removeProduct } = require('../utils/database');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove_product')
        .setDescription('Remove a product from the store')
        .addStringOption(option =>
            option.setName('product')
                .setDescription('Select a product to remove')
                .setRequired(true)
                .setAutocomplete(true)),
    async autocomplete(interaction) {
        try {
            const products = await getAllProducts();
            const choices = products.map(product => ({
                name: product.name,
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
        if (!(await checkAdmin(interaction))) return;
        const productName = interaction.options.getString('product');
        try {
            const product = await getProduct(productName);
            if (!product) {
                await interaction.reply(`Product "${productName}" not found!`);
                return;
            }
            await removeProduct(productName);
            const stockDir = path.join(__dirname, '..', 'stock');
            if (product.cookieMode) {
                const productDir = path.join(stockDir, productName);
                if (fs.existsSync(productDir)) {
                    fs.rmSync(productDir, { recursive: true, force: true });
                }
            } else {
                const productFile = path.join(stockDir, `${productName}.txt`);
                if (fs.existsSync(productFile)) {
                    fs.unlinkSync(productFile);
                }
            }
            await interaction.reply(`Product "${productName}" has been removed successfully!`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Failed to remove product!');
        }
    },
};