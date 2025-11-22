const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkAdmin } = require('../utils/auth');
const { addProduct } = require('../utils/database');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('add_product')
        .setDescription('Add a new product to the store')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Product name')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('price')
                .setDescription('Product price')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('cooldown')
                .setDescription('Cooldown per hour')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('cookie_mode')
                .setDescription('Enable cookie mode')
                .setRequired(true)
                .addChoices(
                    { name: 'True', value: 'true' },
                    { name: 'False', value: 'false' }
                ))
        .addIntegerOption(option =>
            option.setName('precheck_level')
                .setDescription('Precheck level (0=off, 1=auth only, 2=auth+ban)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(2))
        .addStringOption(option =>
            option.setName('precheck_type')
                .setDescription('Precheck account type')
                .setRequired(false)
                .addChoices(
                    { name: 'Email:Password', value: 'email:pass' },
                    { name: 'Token', value: 'token' },
                    { name: 'Cookie', value: 'cookie' }
                )),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const name = interaction.options.getString('name');
        const price = interaction.options.getNumber('price');
        const cooldown = interaction.options.getInteger('cooldown');
        const cookieMode = interaction.options.getString('cookie_mode') === 'true';
        const precheckLevel = interaction.options.getInteger('precheck_level') || 0;
        const precheckType = interaction.options.getString('precheck_type') || 'email:pass';
        try {
            await addProduct(name, price, cooldown, cookieMode, precheckLevel, precheckType);
            const stockDir = path.join(__dirname, '..', 'stock');
            if (!fs.existsSync(stockDir)) {
                fs.mkdirSync(stockDir, { recursive: true });
            }
            if (cookieMode) {
                const productDir = path.join(stockDir, name);
                if (!fs.existsSync(productDir)) {
                    fs.mkdirSync(productDir, { recursive: true });
                }
            } else {
                const productFile = path.join(stockDir, `${name}.txt`);
                fs.writeFileSync(productFile, '');
            }
            await interaction.reply(`Product "${name}" added successfully!\nPrice: ${price}\nCooldown: ${cooldown}/hour\nCookie Mode: ${cookieMode ? 'Enabled' : 'Disabled'}\nPrecheck: Level ${precheckLevel} (${precheckType})`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Failed to add product!');
        }
    },
};